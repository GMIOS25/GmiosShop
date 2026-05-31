import { Component, ComponentRef, Input, Output, EventEmitter, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../../core/services/order.service';
import { Order } from '../../../core/models/order.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-checkout-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkout-modal.component.html',
  styleUrl: './checkout-modal.component.scss'
})
export class CheckoutModalComponent implements OnInit, OnDestroy {
  readonly orderService = inject(OrderService);

  @Input({ required: true }) order!: Order;
  @Output() close = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  // Bank Info from environments
  readonly bankId = environment.bankId;
  readonly bankAccountNo = environment.bankAccountNo;
  readonly bankAccountName = environment.bankAccountName;

  // Countdown timer state
  readonly timeLeft = signal<number>(300); // 5 minutes in seconds
  readonly isCancelling = signal<boolean>(false);
  private timerInterval: any = null;

  // Copy status
  readonly copyStatus = signal<{ [key: string]: boolean }>({});

  // Computed dynamic VietQR generator URL
  readonly vietQrUrl = computed(() => {
    const amount = this.order.amount;
    const addInfo = this.order.payment_code;
    return `https://img.vietqr.io/image/${this.bankId}-${this.bankAccountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(this.bankAccountName)}`;
  });

  // Computed formatted time (MM:SS)
  readonly formattedTime = computed(() => {
    const seconds = this.timeLeft();
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  constructor() {
    // Reactive effect to watch for payment success in real-time
    effect(() => {
      const active = this.orderService.activeOrder();
      if (active && active.id === this.order.id && active.payment_status === 'paid') {
        this.success.emit();
      }
    });
  }

  ngOnInit(): void {
    // Calculate elapsed time since creation in case of page refresh (F5)
    const createdAt = new Date(this.order.created_at).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - createdAt) / 1000);
    const remaining = Math.max(0, 300 - elapsedSeconds);
    
    this.timeLeft.set(remaining);

    if (remaining > 0) {
      this.startTimer();
    } else {
      this.handleAutoExpire();
    }
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.timeLeft.update(time => {
        if (time <= 1) {
          clearInterval(this.timerInterval);
          this.handleAutoExpire();
          return 0;
        }
        return time - 1;
      });
    }, 1000);
  }

  private async handleAutoExpire(): Promise<void> {
    await this.orderService.expireOrder(this.order.id);
    this.close.emit();
  }

  async handleCancel(): Promise<void> {
    if (this.isCancelling()) return;
    this.isCancelling.set(true);
    try {
      await this.orderService.expireOrder(this.order.id);
      this.close.emit();
    } catch (err) {
      console.error('Error cancelling order manually:', err);
    } finally {
      this.isCancelling.set(false);
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
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }
}
