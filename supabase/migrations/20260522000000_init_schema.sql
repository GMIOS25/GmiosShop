-- Initialization schema for GmiosShop (Angular + Supabase + PayOS)

-- 1. Create games table
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL CHECK (price >= 0),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'pending')),
    images TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    username TEXT NOT NULL, -- Sensitive, game login
    password TEXT NOT NULL, -- Sensitive, game login
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create orders table (now linked to Supabase Auth users)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Link to authenticated Supabase user
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'expired')),
    payment_code TEXT NOT NULL UNIQUE, -- Unique code used for order tracking and PayOS description (e.g., GMIS12345)
    payment_link_id TEXT, -- PayOS paymentLinkId
    checkout_url TEXT, -- PayOS checkoutUrl
    buyer_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create trigger to update updated_at on orders table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Indexes for query optimization
CREATE INDEX idx_accounts_game_id ON accounts(game_id);
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_price ON accounts(price);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_payment_code ON orders(payment_code);
CREATE INDEX idx_orders_payment_link_id ON orders(payment_link_id);

-- 6. Insert Mock Seed Data

-- Games list
INSERT INTO games (name, slug, image_url) VALUES
('Liên Minh Huyền Thoại', 'lol', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800'),
('FC Online', 'fco', 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=800'),
('Liên Quân Mobile', 'lqm', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800');

-- Temporary variables to hold game IDs for inserting accounts
-- We use a DO block to ensure ids match correctly
DO $$
DECLARE
    lol_id UUID;
    fco_id UUID;
    lqm_id UUID;
BEGIN
    SELECT id INTO lol_id FROM games WHERE slug = 'lol';
    SELECT id INTO fco_id FROM games WHERE slug = 'fco';
    SELECT id INTO lqm_id FROM games WHERE slug = 'lqm';

    -- League of Legends accounts
    INSERT INTO accounts (game_id, title, description, price, status, username, password, images) VALUES
    (lol_id, 'Acc LMHT VIP - 120 Skin - Rank Kim Cương IV', 'Tài khoản có đầy đủ các tướng, 120 skin (gồm 3 skin Tối Thượng: Lux Thập Đại Nguyên Tố, Ezreal Vũ Khí Tối Thượng, Udyr Tứ Linh Vệ Hồn). Rank hiện tại Kim Cương IV, MMR ổn định.', 450000, 'available', 'lmht_acc_vip1', 'pass12345@@', ARRAY['https://images.unsplash.com/photo-1553481187-be93c21490a9?auto=format&fit=crop&q=80&w=800', 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&q=80&w=800']),
    (lol_id, 'Acc Rank Cao Thủ - Full Champ - 40 Skin Cực Độc', 'Tài khoản rank Cao Thủ đơn/đôi Việt Nam. Thích hợp cho bạn nào muốn trải nghiệm leo rank cao. Full tướng, 40 trang phục sành điệu.', 850000, 'available', 'lmht_master_acc', 'gmiosmaster1!', ARRAY['https://images.unsplash.com/photo-1553481187-be93c21490a9?auto=format&fit=crop&q=80&w=800']),
    (lol_id, 'Acc Rác Giá Rẻ - Level 30 - Thích hợp Test Tool/Smurf', 'Tài khoản cấp độ 30 mới tinh, trắng thông tin, chưa rank mùa này. Khoảng 20 tướng cơ bản.', 20000, 'available', 'lmht_smurf_01', 'smurfpass11', ARRAY['https://images.unsplash.com/photo-1553481187-be93c21490a9?auto=format&fit=crop&q=80&w=800']);

    -- FC Online accounts
    INSERT INTO accounts (game_id, title, description, price, status, username, password, images) VALUES
    (fco_id, 'Đội hình Chelsea 100 Tỷ BP - Có Ronaldo Icon', 'Đội hình Full Chelsea cực mạnh, giá trị đội hình trên 100 tỷ BP. Có Ronaldo Icon +3, Lampard LN +5, Drogba LN +5. Thông tin trắng sạch.', 600000, 'available', 'fifa_chelsea_100b', 'cfc12345678', ARRAY['https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=800']),
    (fco_id, 'Acc Fifa Giá Rẻ - Đội hình Quốc Dân 10 Tỷ BP', 'Phù hợp cho người mới chơi. Đội hình quốc dân dễ leo rank, giá trị 10 tỷ BP. Có đầy đủ phôi và các gói mở thẻ chưa dùng.', 90000, 'available', 'fifa_starter_99', 'star1234567', ARRAY['https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=800']);

    -- Arena of Valor accounts
    INSERT INTO accounts (game_id, title, description, price, status, username, password, images) VALUES
    (lqm_id, 'Acc Liên Quân VIP - Full Tướng - 80 Skin (Có Nakroth Thứ Nguyên Vệ Thần)', 'Acc siêu phẩm Nakroth Thứ Nguyên Vệ Thần, Raz Chiến Thần Muay Thái, Ngộ Không Khá Bảnh. Full tướng, 12 bảng ngọc chuẩn cấp 3. Sổ sứ mệnh hiện tại đã max.', 1200000, 'available', 'lq_nak_tnvt', 'nakrothvip11', ARRAY['https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800']),
    (lqm_id, 'Acc Liên Quân Rank Tinh Anh - 30 Skin - Trắng Thông Tin', 'Tài khoản sạch, chưa liên kết số điện thoại. Có 30 skin bậc A/S. Rank hiện tại Tinh Anh II.', 150000, 'available', 'lq_tinhanh_clean', 'cleanpass22', ARRAY['https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800']);
END $$;
