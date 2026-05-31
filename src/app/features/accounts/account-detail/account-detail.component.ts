import { Component, computed, inject, OnInit, signal, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountService } from '../../../core/services/account.service';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { AccountCredentials } from '../../../core/models/account.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckoutModalComponent } from '../checkout-modal/checkout-modal.component';

@Component({
  selector: 'app-account-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, CheckoutModalComponent],
  templateUrl: './account-detail.component.html',
  styleUrl: './account-detail.component.scss'
})
export class AccountDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly accountService = inject(AccountService);
  readonly authService = inject(AuthService);
  readonly orderService = inject(OrderService);

  // Gallery state
  readonly selectedImageIndex = signal<number>(0);

  // Checkout modal visibility
  readonly showCheckout = signal<boolean>(false);

  // Purchased credentials
  readonly credentials = signal<AccountCredentials | null>(null);
  readonly loadingCredentials = signal<boolean>(false);
  readonly copyStatus = signal<{ [key: string]: boolean }>({});

  // Computed properties
  readonly account = this.accountService.selectedAccount;
  
  readonly isPurchased = computed(() => {
    const acc = this.account();
    if (!acc) return false;
    
    // Look for a paid order for this account
    return this.orderService.orders().some(
      order => order.account_id === acc.id && order.payment_status === 'paid'
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      if (id) {
        this.selectedImageIndex.set(0);
        this.credentials.set(null);
        
        // Fetch detailed account info
        await this.accountService.loadAccountDetails(id);
        
        // If logged in, load user orders to check purchase status
        if (this.authService.isAuthenticated()) {
          await this.orderService.loadUserOrders();
          
          // Check if already purchased, if yes -> load credentials
          if (this.isPurchased()) {
            await this.loadCredentials(id);
          } else {
            // F5 Persistence Check: look for active pending order for this account
            const pendingOrder = this.orderService.orders().find(
              o => o.account_id === id && o.payment_status === 'pending'
            );

            if (pendingOrder) {
              const createdAt = new Date(pendingOrder.created_at).getTime();
              const now = Date.now();
              const elapsedSeconds = Math.floor((now - createdAt) / 1000);
              
              if (elapsedSeconds < 300) {
                // Pending order is still valid (< 5 min), restore checkout state
                await this.orderService.loadOrderDetails(pendingOrder.id);
                this.orderService.subscribeToOrderRealtime(pendingOrder.id);
                this.showCheckout.set(true);
              } else {
                // Pending order has expired (> 5 min), automatically mark it as expired
                await this.orderService.expireOrder(pendingOrder.id);
              }
            }
          }
        }
      }
    });
  }

  async loadCredentials(accountId: string): Promise<void> {
    this.loadingCredentials.set(true);
    try {
      const creds = await this.accountService.getAccountCredentials(accountId);
      this.credentials.set(creds);
    } catch (err) {
      console.error('Error fetching credentials:', err);
    } finally {
      this.loadingCredentials.set(false);
    }
  }

  async handleBuy(): Promise<void> {
    const acc = this.account();
    const email = this.authService.currentUser()?.email;
    
    if (!acc) return;
    
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth']);
      return;
    }

    if (acc.status !== 'available') {
      return;
    }

    if (email) {
      const order = await this.orderService.createOrder(acc.id, acc.price, email);
      if (order) {
        this.showCheckout.set(true);
      }
    }
  }

  closeCheckout(): void {
    this.showCheckout.set(false);
    this.orderService.clearActiveOrder();
  }

  async onPaymentSuccess(): Promise<void> {
    const acc = this.account();
    if (acc) {
      this.showCheckout.set(false);
      await this.loadCredentials(acc.id);
      this.orderService.clearActiveOrder();
    }
  }

  copyToClipboard(text: string, key: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.copyStatus.update(status => ({ ...status, [key]: true }));
        setTimeout(() => {
          this.copyStatus.update(status => ({ ...status, [key]: false }));
        }, 2000);
      });
    }
  }

  ngOnDestroy(): void {
    this.orderService.clearActiveOrder();
  }
}
