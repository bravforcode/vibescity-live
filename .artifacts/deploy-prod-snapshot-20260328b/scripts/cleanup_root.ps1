$files = @(
  'push_err.txt','push_err2.txt','push_err3.txt','push_err4.txt','push_err5.txt','push_err6.txt','push_err7.txt','push_err_final.txt',
  'supabase_push_error.txt','supabase_push_error2.txt','supabase_push_error3.txt',
  'supabase_db_push_error_3.txt','supabase_push_error_4.txt','supabase_push_error_5.txt','supabase_push_error_6.txt','supabase_push_error_7.txt',
  'supabase_push_error_8.txt','supabase_push_error_9.txt','supabase_push_error_10.txt','supabase_push_error_11.txt','supabase_push_error_12.txt',
  'supabase_push_error_13.txt','supabase_push_error_14.txt','supabase_push_error_15.txt','supabase_push_error_16.txt','supabase_push_error_17.txt',
  'backend-ruff-errors.txt','backend-ruff-errors2.txt','backend-ruff-errors3.txt',
  'ruff-errors.txt','ruff-errors3.txt',
  'lint-errors.txt','lint_output.txt','lint_output_full.txt',
  'tsc-errors.txt','tsc-errors2.txt','tsc-output.txt',
  'doctor_output.txt','doctor_output_v2.txt',
  'fix_ruff.py','fix_ruff_2.py','upgrade_settings.py',
  'test.js','test.sql','test_enums.sql','test_out.txt','test_output.txt',
  'db_check.cjs','test-rpc.cjs',
  'tmp_pending_video_candidates.json','tmp_schema.sql',
  'oldest_header.vue',
  'output_schema.txt','count_loc.txt',
  'smartheader_commit.txt','smartheader_diff.txt',
  'mig_list.txt',
  'supabase_push_error.txt',
  'supabase_local_schema.sql',
  'dashboard-ui-unification-track.md',
  'task_instructions.md',
  'implementation_plan.md'
)

foreach ($f in $files) {
  $path = Join-Path 'c:\vibecity.live' $f
  if (Test-Path $path) {
    Remove-Item $path -Force
    Write-Host "Deleted: $f"
  }
}
Write-Host "Cleanup complete."
