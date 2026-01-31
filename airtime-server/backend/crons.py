from crontab import CronTab
import db

# --- Helper Functions ---

def _add(cron, job_id, cmd, schedule, enabled):
    """Creates a new cron job."""
    new_job = cron.new(command=cmd, comment=job_id)
    new_job.setall(schedule)
    new_job.enable(enabled)
    print(f"Creating job: {job_id}")
    return True


def _update(job, cmd, schedule, enabled):
    """
    Checks if an existing job differs from settings.
    Updates it if necessary (Idempotency check).
    Returns True if an update occurred, False otherwise.
    """
    # Normalize comparison inputs
    is_same_command = job.command == cmd
    is_same_schedule = str(job.slices) == schedule
    is_same_enabled = job.is_enabled() == enabled

    if is_same_command and is_same_schedule and is_same_enabled:
        return False  # No changes needed

    # Apply changes
    job.set_command(cmd)
    job.setall(schedule)
    job.enable(enabled)
    print(f"Updating job: {job.comment}")
    return True


def _recreate(cron, job_id, cmd, schedule, enabled):
    """
    Safely handles duplicate/corrupt entries by nuking
    all jobs with this ID and creating a fresh one.
    """
    cron.remove_all(comment=job_id)
    _add(cron, job_id, cmd, schedule, enabled)
    print(f"Fixed duplicate/corrupt entry: {job_id}")
    return True


def _delete(cron, desired_ids):
    """
    Removes any cron job with an ID (comment) that isn't in the settings.
    Returns True if any jobs were removed.
    """
    pruned = False
    # Iterate over a list copy so we can modify the original safely
    for job in list(cron):
        if job.comment and job.comment not in desired_ids:
            print(f"Pruning job: {job.comment}")
            cron.remove(job)
            pruned = True
    return pruned


# --- Main Logic ---

def list_cron_tasks():
    """Lists all current cron jobs in a formatted way."""
    cron = CronTab(user='root')

    print(f"\n{'TIME':<15} | {'ENABLED':<8} | {'ID':<20} | {'COMMAND'}")
    print("-" * 80)

    for job in cron:
        enabled = "✓ YES" if job.is_enabled() else "✗ NO"
        comment = job.comment or "(no ID)"
        print(f"{str(job.slices):<15} | {enabled:<8} | {comment:<20} | {job.command}")

    if not list(cron):
        print("No cron jobs found.")


def sync():
    """
    Main orchestrator.
    Syncs system crontab to match database exactly.
    """
    desired_jobs = db.get_cron_jobs()

    # Map for easy lookup: { 'job_id': job_data_dict }
    desired_map = {job["id"]: job for job in desired_jobs}
    desired_ids = set(desired_map.keys())

    cron = CronTab(user='root')
    updates_made = False

    # 1. Process Desired Jobs (Add / Update / Recreate)
    for job_id, data in desired_map.items():
        cmd = data["command"]
        sch = data["schedule"]
        enabled = data.get("enabled", True)

        existing_jobs = list(cron.find_comment(job_id))
        count = len(existing_jobs)

        if count == 0:
            if _add(cron, job_id, cmd, sch, enabled):
                updates_made = True

        elif count == 1:
            if _update(existing_jobs[0], cmd, sch, enabled):
                updates_made = True

        else:
            # count > 1 (Duplicates found)
            if _recreate(cron, job_id, cmd, sch, enabled):
                updates_made = True

    # 2. Prune Undesired Jobs
    if _delete(cron, desired_ids):
        updates_made = True

    # 3. Commit Changes
    if updates_made:
        cron.write()
        print("Sync complete.")
    else:
        print("Already in sync.")


if __name__ == '__main__':
    sync()
    list_cron_tasks()
