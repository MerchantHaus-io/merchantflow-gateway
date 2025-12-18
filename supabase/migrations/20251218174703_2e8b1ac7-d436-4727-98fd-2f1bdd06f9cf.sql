-- Create chat channels table
CREATE TABLE public.chat_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat_channels
CREATE POLICY "Authenticated users can view channels"
ON public.chat_channels FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create channels"
ON public.chat_channels FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- RLS policies for chat_messages
CREATE POLICY "Authenticated users can view messages"
ON public.chat_messages FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can send messages"
ON public.chat_messages FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Insert default general channel
INSERT INTO public.chat_channels (name) VALUES ('general');

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;