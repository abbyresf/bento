-- Change invite expiry from 7 days to 24 hours.
-- Existing pending invites keep their original expiry; only new ones are affected.
ALTER TABLE public.pulse_invites
  ALTER COLUMN expires_at SET DEFAULT now() + interval '24 hours';
