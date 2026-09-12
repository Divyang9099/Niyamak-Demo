-- Drop the existing check constraint on attendance status
ALTER TABLE pilot_attendance DROP CONSTRAINT IF EXISTS pilot_attendance_status_check;

-- Update existing 'absent' records to 'wfh'
UPDATE pilot_attendance SET status = 'wfh' WHERE status = 'absent';

-- Re-add the check constraint with 'wfh' and 'ot' instead of 'absent'
ALTER TABLE pilot_attendance ADD CONSTRAINT pilot_attendance_status_check CHECK (status IN ('present', 'on_field', 'on_leave', 'wfh', 'half_day', 'holiday', 'off', 'ot'));
