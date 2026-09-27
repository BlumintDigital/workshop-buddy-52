-- Test database only: the signup trigger lives on auth.users, which the
-- public-schema dump leaves out. Production has the same trigger.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
