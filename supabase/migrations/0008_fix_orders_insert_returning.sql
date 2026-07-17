-- ============================================================================
-- 0008 — Fix orders INSERT ... RETURNING for the owner (checkout was broken).
--
-- Bug: `createOrder` inserts with `.select("id").single()` (needs the id to
-- redirect). PostgreSQL evaluates the SELECT policy on the RETURNING row, i.e.
-- `orders_select_participants USING can_access_order(id)`.
--
-- `can_access_order(o_id)` is STABLE SECURITY DEFINER and re-queries
-- `public.orders WHERE id = o_id`. A STABLE function sees the snapshot as of the
-- START of the calling statement — which does NOT contain the row being
-- inserted by that very statement. So for a brand-new order the function finds
-- nothing, returns false, and RLS denies the readback with 42501. Result: every
-- checkout failed with "Couldn't place your order — try again", even though the
-- INSERT itself (WITH CHECK user_id = auth.uid()) passes. INSERT is the only
-- affected verb — UPDATE/other-table RETURNING re-query already-committed rows.
--
-- Fix: short-circuit the owner check directly on the candidate row's own
-- column, before delegating to the self-referential function. `user_id =
-- auth.uid()` is evaluated against the NEW row's values (no snapshot re-query),
-- so an owner can always read back their own row. Behavior is otherwise
-- unchanged: can_access_order already covered owners; admins/boosters still
-- fall through to it for rows they don't own.
-- ============================================================================

drop policy if exists orders_select_participants on public.orders;

create policy orders_select_participants on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.can_access_order(id));
