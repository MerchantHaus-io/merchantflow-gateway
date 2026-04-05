

## User Management Section for Administration Page

### Summary
Add a "Team & Roles" management card to the Administration page where admins can view all team members and toggle their admin role. Also fix the missing admin role for `admin@merchanthaus.io` (Jamie).

### Database Fix
- **Migration**: Insert the missing admin role for Jamie (`admin@merchanthaus.io` / `f1168d85-6037-41c0-a0f7-0d64e9103ba0`) into the `user_roles` table.
- **RLS Policy**: Add an admin-only INSERT and DELETE policy on `user_roles` so admins can grant/revoke roles from the UI. Currently the table has RLS enabled but the existing policies only allow SELECT via `has_role()`. We need:
  - `Admins can manage roles` (INSERT, UPDATE, DELETE) gated by `is_admin_email()`.
  - `Authenticated users can view roles` (SELECT) for all authenticated users.

### New Component: `src/components/admin/UserRoleManager.tsx`
A self-contained card component that:
1. Fetches all profiles joined with their roles from `user_roles`.
2. Displays a table with columns: **Avatar**, **Name**, **Email**, **Role** (badge), **Actions**.
3. Each non-admin user row shows a "Grant Admin" button; each admin row shows a "Revoke Admin" button (disabled for the current user to prevent self-demotion).
4. Toggling a role inserts into or deletes from `user_roles`.
5. Uses `toast` for success/error feedback.
6. Subscribes to realtime changes on `user_roles` for live updates.

### Administration Page Update
- Import and render `<UserRoleManager />` between the Admin Popup Manager and the Agenda Manager sections (logical placement — team management before agenda management).

### Technical Details
- The `user_roles` table uses the `app_role` enum (`admin`, `moderator`, `user`). This UI will manage the `admin` role specifically.
- No new tables or columns needed — just RLS policies and a data fix.
- The component queries `profiles` for the user list and `user_roles` for role data, joining client-side.

