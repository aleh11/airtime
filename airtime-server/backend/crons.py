from crontab import CronTab
import db


def _add(cron, job_id, cmd, schedule, enabled):
    new_job = cron.new(command=cmd, comment=job_id)
    new_job.setall(schedule)
    new_job.enable(enabled)
    print(f"Creating job: {job_id}")
    return True


def _update(job, cmd, schedule, enabled):
    if job.command == cmd and str(job.slices) == schedule and job.is_enabled() == enabled:
        return False

    job.set_command(cmd)
    job.setall(schedule)
    job.enable(enabled)
    print(f"Updating job: {job.comment}")
    return True


def _recreate(cron, job_id, cmd, schedule, enabled):
    cron.remove_all(comment=job_id)
    _add(cron, job_id, cmd, schedule, enabled)
    print(f"Fixed duplicate/corrupt entry: {job_id}")
    return True


def _delete(cron, desired_ids):
    pruned = False
    for job in list(cron):
        if job.comment and job.comment not in desired_ids:
            print(f"Pruning job: {job.comment}")
            cron.remove(job)
            pruned = True
    return pruned


def list_cron_tasks():
    cron = CronTab(user='root')

    print(f"\n{'TIME':<15} | {'ENABLED':<8} | {'ID':<20} | {'COMMAND'}")
    print("-" * 80)

    for job in cron:
        enabled = "YES" if job.is_enabled() else "NO"
        comment = job.comment or "(no ID)"
        print(f"{str(job.slices):<15} | {enabled:<8} | {comment:<20} | {job.command}")

    if not list(cron):
        print("No cron jobs found.")


def sync():
    desired_jobs = db.get_cron_jobs()
    desired_map = {job["id"]: job for job in desired_jobs}
    desired_ids = set(desired_map.keys())

    cron = CronTab(user='root')
    updates_made = False

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
            if _recreate(cron, job_id, cmd, sch, enabled):
                updates_made = True

    if _delete(cron, desired_ids):
        updates_made = True

    if updates_made:
        cron.write()
        print("Sync complete.")
    else:
        print("Already in sync.")


def pause_all_crons():
    """Disables all cron jobs in system crontab without touching DB"""
    cron = CronTab(user='root')
    for job in cron:
        job.enable(False)
    cron.write()
    print("All system crons paused (Time Tester active)")


def resume_all_crons():
    """Resyncs system cronta from DB (effectively resuming enabled jobs)"""
    sync()
    print("All system crons resumed (Time Tester stopped)")


if __name__ == '__main__':
    sync()
    list_cron_tasks()
