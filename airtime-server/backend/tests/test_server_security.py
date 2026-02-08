
import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Add parent directory to path to import server
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Mock dependencies BEFORE importing server
sys.modules['db'] = MagicMock()
sys.modules['crons'] = MagicMock()
sys.modules['gpiozero'] = MagicMock()


import asyncio

class TestSecurityFixes(unittest.TestCase):
    def setUp(self):
        # We don't need TestClient anymore
        pass
        
    @patch('server.db.add_or_update_cron_job')
    @patch('server.crons.sync')
    def test_cron_rce_prevention(self, mock_sync, mock_db_add):
        """
        Verify that malicious commands are sanitized/reconstructed.
        Calling the path operation function directly to avoid httpx dependency.
        """
        # Malicious payload
        # We need to construct the Pydantic model manually
        job_input = server.CronJobInput(
            id="exploit",
            command="/usr/bin/txtempus -s DCF77 -r 10; whoami > /tmp/pwned",
            time="12:00",
            frequency="daily",
            enabled=True
        )

        # Call the function directly (it's async)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # We need to mock validate_txtempus_command if it wasn't mocked, 
        # but here we want to test the logic INSIDE the function which calls validate.
        # So we let it run.
        
        loop.run_until_complete(server.add_or_update_cron(job_input))
        loop.close()
        
        # Verify what was passed to DB
        args, _ = mock_db_add.call_args
        saved_command = args[1] if len(args) > 1 else mock_db_add.call_args.kwargs['command']
        
        # Expected reconstruction:
        # /usr/bin/txtempus -s DCF77 -r 10
        # (offset is 0 so no -z)
        
        expected_command = "/usr/bin/txtempus -s DCF77 -r 10"
        
        self.assertEqual(saved_command, expected_command)
        self.assertNotIn("whoami", saved_command)
        self.assertNotIn(";", saved_command)

    @patch('server.subprocess.run')
    @patch('server.threading.Thread')
    def test_update_hardening(self, mock_thread, mock_run):
        """
        Verify update mechanism uses background thread and safe subprocess.
        """
        # Call the function directly
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(server.apply_update())
        loop.close()
        
        # Verify thread started
        self.assertTrue(mock_thread.called)
        
        # Verify no unsages of Popen shell=True or similar if we could, 
        # but here we just check it runs the thread.
        with patch('server.subprocess.Popen') as mock_popen:
            # We need to re-run to trigger the mock
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(server.apply_update())
            loop.close()
            self.assertFalse(mock_popen.called, "Should not use Popen with shell script anymore")

if __name__ == '__main__':
    unittest.main()
