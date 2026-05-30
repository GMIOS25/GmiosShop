export interface Account {
  id: string;
  game_id: string;
  title: string;
  description?: string;
  price: number;
  status: 'available' | 'sold' | 'pending';
  images: string[];
  created_at: string;
  game?: {
    name: string;
    slug: string;
  };
}

export interface AccountCredentials {
  account_id: string;
  username: string;
  password: string;
  created_at: string;
}
