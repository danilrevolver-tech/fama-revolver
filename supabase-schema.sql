-- Таблица профилей (расширение auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица жалоб
CREATE TABLE public.complaints (
  id TEXT PRIMARY KEY,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица постов форума
CREATE TABLE public.forum_posts (
  id TEXT PRIMARY KEY,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  replies INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица ответов в форуме
CREATE TABLE public.forum_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES public.forum_posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица форума союзов
CREATE TABLE public.union_forum_posts (
  id TEXT PRIMARY KEY,
  union_id TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица комментариев форума союзов
CREATE TABLE public.union_forum_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES public.union_forum_posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица сообщений
CREATE TABLE public.messages (
  id TEXT PRIMARY KEY,
  from_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  to_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица рынка
CREATE TABLE public.market_listings (
  id TEXT PRIMARY KEY,
  seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица новостей
CREATE TABLE public.news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица казны
CREATE TABLE public.treasury (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image TEXT,
  goal INTEGER NOT NULL,
  current INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица событий
CREATE TABLE public.events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.union_forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.union_forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- RLS Policies (читать может любой, писать только авторизованные)
CREATE POLICY "Profiles readable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles insertable by authenticated" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles updatable by own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Complaints readable by all" ON public.complaints FOR SELECT USING (true);
CREATE POLICY "Complaints insertable by authenticated" ON public.complaints FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Complaints updatable by author" ON public.complaints FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Forum posts readable by all" ON public.forum_posts FOR SELECT USING (true);
CREATE POLICY "Forum posts insertable by authenticated" ON public.forum_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Forum posts updatable by author" ON public.forum_posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Forum replies readable by all" ON public.forum_replies FOR SELECT USING (true);
CREATE POLICY "Forum replies insertable by authenticated" ON public.forum_replies FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Union forum readable by all" ON public.union_forum_posts FOR SELECT USING (true);
CREATE POLICY "Union forum insertable by authenticated" ON public.union_forum_posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Union comments readable by all" ON public.union_forum_comments FOR SELECT USING (true);
CREATE POLICY "Union comments insertable by authenticated" ON public.union_forum_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Messages readable by participants" ON public.messages FOR SELECT USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "Messages insertable by authenticated" ON public.messages FOR INSERT WITH CHECK (auth.uid() = from_id);

CREATE POLICY "Market readable by all" ON public.market_listings FOR SELECT USING (true);
CREATE POLICY "Market insertable by authenticated" ON public.market_listings FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "News readable by all" ON public.news FOR SELECT USING (true);
CREATE POLICY "Treasury readable by all" ON public.treasury FOR SELECT USING (true);
CREATE POLICY "Events readable by all" ON public.events FOR SELECT USING (true);
