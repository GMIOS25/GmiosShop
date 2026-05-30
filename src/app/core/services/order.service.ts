import { Injectable, signal, OnDestroy } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Order } from '../models/order.model';

@Injectable({
  providedIn: 'root'
})
export class OrderService implements OnDestroy {
  // Private Writable Signals
  readonly #orders = signal<Order[]>([]);
  readonly #activeOrder = signal<Order | null>(null);
  readonly #loading = signal<boolean>(false);

  // Public Read-Only Signals
  readonly orders = this.#orders.asReadonly();
  readonly activeOrder = this.#activeOrder.asReadonly();
  readonly loading = this.#loading.asReadonly();

  private realtimeChannel: RealtimeChannel | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private authService: AuthService
  ) {}

  async loadUserOrders(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.#orders.set([]);
      return;
    }

    this.#loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('orders')
        .select(`
          *,
          account:accounts(
            id,
            title,
            price,
            game:games(name, slug)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.#orders.set(data as any || []);
    } catch (err) {
      console.error('Error loading user orders:', err);
    } finally {
      this.#loading.set(false);
    }
  }

  async createOrder(accountId: string, amount: number, buyerEmail: string): Promise<Order | null> {
    const user = this.authService.currentUser();
    if (!user) {
      console.error('Cannot create order: User is not authenticated.');
      return null;
    }

    this.#loading.set(true);
    try {
      // Generate a unique payment code: e.g. GMS[timestamp][random_digit]
      const randomDigit = Math.floor(Math.random() * 10);
      const paymentCode = `GMS${Date.now()}${randomDigit}`;

      const { data, error } = await this.supabaseService.client
        .from('orders')
        .insert({
          user_id: user.id,
          account_id: accountId,
          amount,
          payment_code: paymentCode,
          buyer_email: buyerEmail,
          payment_status: 'pending'
        })
        .select(`
          *,
          account:accounts(
            id,
            title,
            price,
            game:games(name, slug)
          )
        `)
        .single();

      if (error) throw error;

      const newOrder = data as any as Order;
      this.#activeOrder.set(newOrder);
      this.subscribeToOrderRealtime(newOrder.id);
      
      // Refresh order history
      this.loadUserOrders();

      return newOrder;
    } catch (err) {
      console.error('Error creating order:', err);
      return null;
    } finally {
      this.#loading.set(false);
    }
  }

  async loadOrderDetails(orderId: string): Promise<void> {
    this.#loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('orders')
        .select(`
          *,
          account:accounts(
            id,
            title,
            price,
            game:games(name, slug)
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      this.#activeOrder.set(data as any as Order);
    } catch (err) {
      console.error('Error loading order details:', err);
      this.#activeOrder.set(null);
    } finally {
      this.#loading.set(false);
    }
  }

  subscribeToOrderRealtime(orderId: string): void {
    this.unsubscribeFromRealtime();

    if (!this.supabaseService.isBrowserEnv) return;

    console.log(`Subscribing to realtime updates for order ${orderId}`);
    this.realtimeChannel = this.supabaseService.client
      .channel(`order-updates-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        },
        async (payload) => {
          console.log('Realtime order update received:', payload);
          
          // Re-fetch detailed order to keep account info updated
          await this.loadOrderDetails(orderId);
          
          // Refresh user order history
          this.loadUserOrders();

          const updatedOrder = this.#activeOrder();
          if (updatedOrder && (updatedOrder.payment_status === 'paid' || updatedOrder.payment_status === 'expired')) {
            console.log(`Order status became ${updatedOrder.payment_status}, unsubscribing from realtime.`);
            this.unsubscribeFromRealtime();
          }
        }
      )
      .subscribe();
  }

  unsubscribeFromRealtime(): void {
    if (this.realtimeChannel) {
      console.log('Unsubscribing from order realtime updates.');
      this.supabaseService.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  clearActiveOrder(): void {
    this.unsubscribeFromRealtime();
    this.#activeOrder.set(null);
  }

  ngOnDestroy(): void {
    this.unsubscribeFromRealtime();
  }
}
