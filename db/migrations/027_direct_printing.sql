-- Direct request handling claims each job independently. XPYUN orders its own queue.
-- Remove the obsolete worker-wide lock; preserve all historical records.
DROP INDEX IF EXISTS print_deliveries_one_sender_per_sn_idx;
