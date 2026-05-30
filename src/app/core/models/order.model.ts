export interface Order {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  payment_status: 'pending' | 'paid' | 'expired';
  payment_code: string;
  payment_link_id?: string;
  checkout_url?: string;
  buyer_email: string;
  created_at: string;
  updated_at: string;
  account?: {
    id: string;
    title: string;
    price: number;
    game?: {
      name: string;
      slug: string;
    };
  };
}
