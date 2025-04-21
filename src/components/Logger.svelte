<script lang="ts">
  import { onMount } from 'svelte';
  
  let { logs, title } = $props();
  
  // ログが追加されたときに自動スクロール
  $effect(() => {
    if (logs.length > 0) {
      setTimeout(() => {
        const logContainer = document.querySelector('.log-container');
        if (logContainer) {
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      }, 0);
    }
  });
</script>

<div class="mt-4 bg-gray-100 p-4 rounded-lg max-h-64 overflow-y-auto log-container">
  <h3 class="text-sm font-semibold mb-2">{title}</h3>
  <div class="font-mono text-xs space-y-1">
    {#each logs as log}
      <div class="text-gray-700">{log}</div>
    {/each}
  </div>
</div> 