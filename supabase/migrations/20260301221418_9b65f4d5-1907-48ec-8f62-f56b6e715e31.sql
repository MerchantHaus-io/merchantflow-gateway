
-- Update the post_system_chat_message function to default to 'ops-updates' channel
CREATE OR REPLACE FUNCTION public.post_system_chat_message(p_content text, p_channel_name text DEFAULT 'ops-updates'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_channel_id uuid;
  v_system_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  -- Get or create the channel
  SELECT id INTO v_channel_id FROM chat_channels WHERE name = p_channel_name LIMIT 1;
  
  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels (name, created_by)
    VALUES (p_channel_name, NULL)
    RETURNING id INTO v_channel_id;
  END IF;
  
  -- Insert the system message
  INSERT INTO chat_messages (channel_id, user_id, user_email, user_name, content)
  VALUES (v_channel_id, v_system_user_id, 'system@ops.internal', 'Ops-Update', p_content);
END;
$function$;
