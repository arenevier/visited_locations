export const registerCleanupMethod = (() => {
  const actions: Array<() => void> = [];

  // based on https://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits
  function exitHandler(options: { cleanup?: boolean, exit?: boolean }) {
    if (options.cleanup != null) {
      actions.forEach(action => {
        action();
      });
    }
    if (options.exit != null) {
      process.exit();
    }
  }

  process.on('exit', exitHandler.bind(null, { cleanup: true }));
  process.on('SIGINT', exitHandler.bind(null, { exit: true }));
  process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
  process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

  return (action: () => void) => {
    actions.push(action);
  }
})();
