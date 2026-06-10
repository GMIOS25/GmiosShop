import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Game } from '../models/game.model';
import { Account } from '../models/account.model';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly supabaseService = inject(SupabaseService);

  async getDashboardStats() {
    if (!this.supabaseService.isBrowserEnv) {
      return {
        totalGames: 0,
        totalAccounts: 0,
        availableAccounts: 0,
        soldAccounts: 0,
        pendingAccounts: 0,
        totalOrders: 0,
        paidOrders: 0,
        pendingOrders: 0,
        expiredOrders: 0,
        totalRevenue: 0
      };
    }

    try {
      const [gamesCountRes, accountsCountRes, ordersRes] = await Promise.all([
        this.supabaseService.client.from('games').select('id', { count: 'exact', head: true }),
        this.supabaseService.client.from('accounts').select('status'),
        this.supabaseService.client.from('orders').select('amount, payment_status')
      ]);

      if (gamesCountRes.error) throw gamesCountRes.error;
      if (accountsCountRes.error) throw accountsCountRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const totalGames = gamesCountRes.count || 0;
      const accounts = accountsCountRes.data || [];
      const orders = ordersRes.data || [];

      const stats = {
        totalGames,
        totalAccounts: accounts.length,
        availableAccounts: accounts.filter(a => a.status === 'available').length,
        soldAccounts: accounts.filter(a => a.status === 'sold').length,
        pendingAccounts: accounts.filter(a => a.status === 'pending').length,
        totalOrders: orders.length,
        paidOrders: orders.filter(o => o.payment_status === 'paid').length,
        pendingOrders: orders.filter(o => o.payment_status === 'pending').length,
        expiredOrders: orders.filter(o => o.payment_status === 'expired').length,
        totalRevenue: orders.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + Number(o.amount), 0)
      };

      return stats;
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
      throw err;
    }
  }

  // --- Games CRUD ---
  async createGame(name: string, slug: string, imageUrl?: string): Promise<Game> {
    const { data, error } = await this.supabaseService.client
      .from('games')
      .insert({ name, slug, image_url: imageUrl })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateGame(id: string, name: string, slug: string, imageUrl?: string): Promise<Game> {
    const { data, error } = await this.supabaseService.client
      .from('games')
      .update({ name, slug, image_url: imageUrl })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteGame(id: string): Promise<void> {
    // Check if any accounts are associated with this game
    const { count, error: checkError } = await this.supabaseService.client
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id);

    if (checkError) throw checkError;
    if (count && count > 0) {
      throw new Error('Không thể xóa game này vì đang có tài khoản liên kết.');
    }

    const { error } = await this.supabaseService.client
      .from('games')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // --- Accounts & Credentials CRUD ---
  async createAccount(
    accountData: { game_id: string; title: string; description?: string; price: number; images: string[] },
    credentialsData: { username: string; password: string }
  ): Promise<Account> {
    // 1. Insert into accounts
    const { data: account, error: accountError } = await this.supabaseService.client
      .from('accounts')
      .insert({
        game_id: accountData.game_id,
        title: accountData.title,
        description: accountData.description,
        price: accountData.price,
        status: 'available',
        images: accountData.images
      })
      .select()
      .single();

    if (accountError) throw accountError;

    // 2. Insert credentials
    try {
      const { error: credsError } = await this.supabaseService.client
        .from('account_credentials')
        .insert({
          account_id: account.id,
          username: credentialsData.username,
          password: credentialsData.password
        });

      if (credsError) throw credsError;
      return account;
    } catch (err) {
      // Rollback: delete account if credentials insert fails
      await this.supabaseService.client
        .from('accounts')
        .delete()
        .eq('id', account.id);
      throw err;
    }
  }

  async deleteAccount(id: string, images: string[]): Promise<void> {
    // 1. Delete account from database (Cascade deletes account_credentials automatically)
    const { error } = await this.supabaseService.client
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // 2. Safely delete images from Cloudinary in the background
    if (images && images.length > 0) {
      Promise.all(images.map(url => this.deleteCloudinaryImage(url)))
        .then((results) => {
          console.log('Successfully completed cleanup of Cloudinary images:', results);
        })
        .catch((err) => {
          console.error('Failed to clean up Cloudinary images:', err);
        });
    }
  }

  // --- Cloudinary Integration ---
  async uploadImages(files: File[]): Promise<string[]> {
    if (!this.supabaseService.isBrowserEnv) return [];
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('file', file);
    });

    try {
      const { data, error } = await this.supabaseService.client.functions.invoke('cloudinary-upload', {
        body: formData
      });

      if (error) throw error;
      return data?.secure_urls || [];
    } catch (err) {
      console.error('Error in uploadImages function:', err);
      throw err;
    }
  }

  async deleteCloudinaryImage(url: string): Promise<boolean> {
    if (!this.supabaseService.isBrowserEnv) return false;

    const publicId = this.extractPublicId(url);
    if (!publicId) {
      console.warn('Skipping deletion: Cannot parse public_id from Cloudinary URL:', url);
      return false;
    }

    try {
      const { data, error } = await this.supabaseService.client.functions.invoke('cloudinary-delete', {
        body: { public_id: publicId }
      });

      if (error) {
        console.error(`Failed to delete Cloudinary image: ${publicId}`, error);
        return false;
      }
      return data?.status === 'ok';
    } catch (err) {
      console.error(`Error deleting Cloudinary image: ${publicId}`, err);
      return false;
    }
  }

  private extractPublicId(url: string): string | null {
    try {
      const parts = url.split('/image/upload/');
      if (parts.length < 2) return null;

      const afterUpload = parts[1];
      const subParts = afterUpload.split('/');

      // Check if first subpart is version (e.g. v1234567)
      let startIndex = 0;
      if (subParts[0].match(/^v\d+$/)) {
        startIndex = 1;
      }

      const remainingPath = subParts.slice(startIndex).join('/');
      const lastDotIndex = remainingPath.lastIndexOf('.');
      if (lastDotIndex === -1) return remainingPath;
      return remainingPath.substring(0, lastDotIndex);
    } catch (err) {
      console.error('Failed to extract public_id:', err);
      return null;
    }
  }
}
