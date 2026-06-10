import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { AccountService } from '../../core/services/account.service';
import { Game } from '../../core/models/game.model';
import { Account } from '../../core/models/account.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  protected readonly adminService = inject(AdminService);
  protected readonly accountService = inject(AccountService);

  // UI state signals
  readonly activeTab = signal<'dashboard' | 'games' | 'accounts'>('dashboard');
  readonly loadingStats = signal<boolean>(false);
  readonly actionLoading = signal<boolean>(false);

  // Statistics state signal
  readonly stats = signal<any>({
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
  });

  // Filter signals
  readonly filterGameId = signal<string>('');

  // Modals visibility signals
  readonly showGameModal = signal<boolean>(false);
  readonly showAccountModal = signal<boolean>(false);

  // Game Form fields
  readonly gameFormId = signal<string | null>(null);
  readonly gameFormName = signal<string>('');
  readonly gameFormSlug = signal<string>('');
  readonly gameFormImageUrl = signal<string>('');
  readonly gameFormError = signal<string>('');
  readonly gameFormSuccess = signal<string>('');

  // Account Form fields
  readonly accountFormGameId = signal<string>('');
  readonly accountFormTitle = signal<string>('');
  readonly accountFormDescription = signal<string>('');
  readonly accountFormPrice = signal<number | null>(null);
  readonly accountFormUsername = signal<string>('');
  readonly accountFormPassword = signal<string>('');
  readonly accountFormSelectedFiles = signal<File[]>([]);
  readonly accountFormPreviews = signal<string[]>([]);
  readonly accountFormError = signal<string>('');
  readonly accountFormSuccess = signal<string>('');
  readonly isUploading = signal<boolean>(false);

  // Computed accounts list filtered locally by game if filterGameId is set
  readonly filteredAccounts = computed(() => {
    const list = this.accountService.accounts();
    const gameId = this.filterGameId();
    if (!gameId) return list;
    return list.filter(a => a.game_id === gameId);
  });

  ngOnInit(): void {
    this.loadStats();
    this.accountService.loadGames();
    this.accountService.loadAccounts();
  }

  async loadStats(): Promise<void> {
    this.loadingStats.set(true);
    try {
      const data = await this.adminService.getDashboardStats();
      this.stats.set(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      this.loadingStats.set(false);
    }
  }

  onTabChange(tab: 'dashboard' | 'games' | 'accounts'): void {
    this.activeTab.set(tab);
    if (tab === 'dashboard') {
      this.loadStats();
    } else if (tab === 'games') {
      this.accountService.loadGames();
    } else if (tab === 'accounts') {
      this.accountService.loadGames();
      this.accountService.loadAccounts();
    }
  }

  // --- Game Modal & CRUD ---
  openAddGameModal(): void {
    this.gameFormId.set(null);
    this.gameFormName.set('');
    this.gameFormSlug.set('');
    this.gameFormImageUrl.set('');
    this.gameFormError.set('');
    this.gameFormSuccess.set('');
    this.showGameModal.set(true);
  }

  openEditGameModal(game: Game): void {
    this.gameFormId.set(game.id);
    this.gameFormName.set(game.name);
    this.gameFormSlug.set(game.slug);
    this.gameFormImageUrl.set(game.image_url || '');
    this.gameFormError.set('');
    this.gameFormSuccess.set('');
    this.showGameModal.set(true);
  }

  onGameNameChange(value: string): void {
    this.gameFormName.set(value);
    // Auto-generate slug if we are creating a new game
    if (!this.gameFormId()) {
      this.gameFormSlug.set(this.generateSlug(value));
    }
  }

  async saveGame(): Promise<void> {
    const name = this.gameFormName().trim();
    let slug = this.gameFormSlug().trim();
    const imageUrl = this.gameFormImageUrl().trim();

    if (!name) {
      this.gameFormError.set('Vui lòng nhập tên game.');
      return;
    }
    if (!slug) {
      slug = this.generateSlug(name);
    }

    this.actionLoading.set(true);
    this.gameFormError.set('');
    this.gameFormSuccess.set('');

    try {
      const id = this.gameFormId();
      if (id) {
        await this.adminService.updateGame(id, name, slug, imageUrl || undefined);
        this.gameFormSuccess.set('Cập nhật game thành công!');
      } else {
        await this.adminService.createGame(name, slug, imageUrl || undefined);
        this.gameFormSuccess.set('Thêm game mới thành công!');
      }

      await this.accountService.loadGames();
      await this.loadStats();
      
      setTimeout(() => {
        this.showGameModal.set(false);
      }, 1000);
    } catch (err: any) {
      console.error('Save game failed:', err);
      this.gameFormError.set(err.message || 'Lỗi khi lưu thông tin game. Vui lòng thử lại.');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async deleteGame(id: string): Promise<void> {
    if (!confirm('Bạn có chắc chắn muốn xóa game này không?')) return;

    this.actionLoading.set(true);
    try {
      await this.adminService.deleteGame(id);
      await this.accountService.loadGames();
      await this.loadStats();
    } catch (err: any) {
      console.error('Delete game failed:', err);
      alert(err.message || 'Lỗi khi xóa game. Vui lòng thử lại.');
    } finally {
      this.actionLoading.set(false);
    }
  }

  // --- Account Modal & CRUD ---
  openAddAccountModal(): void {
    this.accountFormGameId.set(this.accountService.games().length > 0 ? this.accountService.games()[0].id : '');
    this.accountFormTitle.set('');
    this.accountFormDescription.set('');
    this.accountFormPrice.set(null);
    this.accountFormUsername.set('');
    this.accountFormPassword.set('');
    this.accountFormSelectedFiles.set([]);
    this.accountFormPreviews.set([]);
    this.accountFormError.set('');
    this.accountFormSuccess.set('');
    this.isUploading.set(false);
    this.showAccountModal.set(true);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    
    // Max 5 files
    const currentFiles = this.accountFormSelectedFiles();
    if (currentFiles.length + files.length > 5) {
      this.accountFormError.set('Bạn chỉ có thể chọn tối đa 5 ảnh.');
      return;
    }

    const updatedFiles = [...currentFiles, ...files];
    this.accountFormSelectedFiles.set(updatedFiles);

    // Create previews
    const newPreviews = files.map(file => URL.createObjectURL(file));
    this.accountFormPreviews.set([...this.accountFormPreviews(), ...newPreviews]);
    this.accountFormError.set('');
  }

  removeSelectedFile(index: number): void {
    const files = [...this.accountFormSelectedFiles()];
    const previews = [...this.accountFormPreviews()];
    
    // Revoke object URL to avoid memory leak
    URL.revokeObjectURL(previews[index]);

    files.splice(index, 1);
    previews.splice(index, 1);

    this.accountFormSelectedFiles.set(files);
    this.accountFormPreviews.set(previews);
  }

  async saveAccount(): Promise<void> {
    const gameId = this.accountFormGameId();
    const title = this.accountFormTitle().trim();
    const description = this.accountFormDescription().trim();
    const price = this.accountFormPrice();
    const username = this.accountFormUsername().trim();
    const password = this.accountFormPassword().trim();
    const files = this.accountFormSelectedFiles();

    if (!gameId) {
      this.accountFormError.set('Vui lòng chọn game.');
      return;
    }
    if (!title) {
      this.accountFormError.set('Vui lòng nhập tiêu đề.');
      return;
    }
    if (price === null || price < 0) {
      this.accountFormError.set('Vui lòng nhập giá bán hợp lệ.');
      return;
    }
    if (!username || !password) {
      this.accountFormError.set('Vui lòng nhập đầy đủ tài khoản/mật khẩu đăng nhập.');
      return;
    }
    if (files.length === 0) {
      this.accountFormError.set('Vui lòng chọn ít nhất 1 ảnh cho tài khoản.');
      return;
    }

    this.isUploading.set(true);
    this.actionLoading.set(true);
    this.accountFormError.set('');
    this.accountFormSuccess.set('');

    try {
      // 1. Upload images to Cloudinary in parallel via Edge Function
      const imageUrls = await this.adminService.uploadImages(files);
      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('Lỗi khi tải ảnh lên máy chủ Cloudinary.');
      }

      // 2. Create account database entry along with credentials
      await this.adminService.createAccount(
        {
          game_id: gameId,
          title,
          description: description || undefined,
          price,
          images: imageUrls
        },
        { username, password }
      );

      this.accountFormSuccess.set('Thêm tài khoản thành công!');
      
      // Clean up object URLs
      this.accountFormPreviews().forEach(preview => URL.revokeObjectURL(preview));

      await this.accountService.loadAccounts();
      await this.loadStats();

      setTimeout(() => {
        this.showAccountModal.set(false);
      }, 1000);
    } catch (err: any) {
      console.error('Save account failed:', err);
      this.accountFormError.set(err.message || 'Lỗi khi tạo tài khoản. Vui lòng kiểm tra lại.');
    } finally {
      this.isUploading.set(false);
      this.actionLoading.set(false);
    }
  }

  async deleteAccount(account: Account): Promise<void> {
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${account.title}" không?`)) return;

    this.actionLoading.set(true);
    try {
      await this.adminService.deleteAccount(account.id, account.images || []);
      await this.accountService.loadAccounts();
      await this.loadStats();
    } catch (err: any) {
      console.error('Delete account failed:', err);
      alert(err.message || 'Lỗi khi xóa tài khoản. Vui lòng thử lại.');
    } finally {
      this.actionLoading.set(false);
    }
  }

  // Helper to slugify string (converts Vietnamese tones and filters non-alphanumeric)
  private generateSlug(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
