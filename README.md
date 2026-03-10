python -m pip install -r requirements.txt
python3 main.py <gd-file>

# AWS Credentials (required for handle_gather_diagnostics.py decryption)
# Option 1 — run "aws configure" if AWS CLI is installed (sets ~/.aws/credentials persistently)
  aws configure
  # Enter: Access Key ID, Secret Access Key, region (us-east-2), output format (json)

# Option 2 — set manually in PowerShell for current session only
  $env:AWS_ACCESS_KEY_ID     = "your-access-key-id"
  $env:AWS_SECRET_ACCESS_KEY = "your-secret-access-key"
  $env:AWS_DEFAULT_REGION    = "us-east-2"

# Option 3 — set persistently via PowerShell (survives restarts)
  [System.Environment]::SetEnvironmentVariable("AWS_ACCESS_KEY_ID",     "your-access-key-id",     "User")
  [System.Environment]::SetEnvironmentVariable("AWS_SECRET_ACCESS_KEY", "your-secret-access-key", "User")
  [System.Environment]::SetEnvironmentVariable("AWS_DEFAULT_REGION",    "us-east-2",              "User")

# OpenAI API Key (required for llm CLI used in health_check_fail_troubleshoot.py)
  llm keys set openai
  # Enter your OpenAI API key when prompted (get one from platform.openai.com)

# Windows CMD - set in your environment
  setx ATLASSIAN_TOKEN "your-new-token"
  setx ATLASSIAN_EMAIL "josh.soutar@solace.com"

# Windows Powershell 
 # Persistent (survives restarts) - run in PowerShell as normal user
  [System.Environment]::SetEnvironmentVariable("ATLASSIAN_TOKEN", "ATATT3xFfGF0vjf7rdgycqhL8IkUpZ3vrAmeGkK9DId1AIi_lViHEWjwUN8_8gnYKCFH_gPrOggrlXJzFhzuoYRiCf2gDNHtJ-cz8jwtpkxuIif21B7iQiqwcmtSg0c5-ym78XGWOP7QLRWNKQ0o3EkXdDtxcflgxjJCtqx-iCanW9TXgYn0tv8=703A40F5", "User")
  [System.Environment]::SetEnvironmentVariable("ATLASSIAN_EMAIL", "josh.soutar@solace.com", "User")