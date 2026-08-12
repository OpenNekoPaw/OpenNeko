export async function openFixtureWorkspace(evaluate) {
  return evaluate(`(async () => {
    await window.openNekoDesktop.shell.getSnapshot();
    const result = await window.openNekoDesktop.projects.openContent();
    if (result.status !== 'opened') throw new Error('Functional fixture Workspace was not opened.');
    const projection = result.projection;
    const active = projection.window.activeTarget;
    if (active.kind !== 'project') throw new Error('Functional fixture Project is not active.');
    const tab = projection.window.tabs.find((candidate) => candidate.tabId === active.tabId);
    if (!tab) throw new Error('Functional fixture Project Tab is missing.');
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === tab.projectId,
    );
    if (!project) throw new Error('Functional fixture Project catalog entry is missing.');
    return { projection, tab, project };
  })()`);
}

export async function replaceWorkbench(evaluate, createWorkbenchSource) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const instance = projection.window.workbench;
    const current = instance.layout;
    const active = projection.window.activeTarget;
    if (active.kind !== 'project') throw new Error('Desktop functional Project is not active.');
    const tab = projection.window.tabs.find((candidate) => candidate.tabId === active.tabId);
    if (!tab) throw new Error('Desktop functional Project Tab is missing.');
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === tab.projectId,
    );
    if (!project) throw new Error('Desktop functional Project is missing.');
    const next = (${createWorkbenchSource})(projection, current, tab, project);
    return window.openNekoDesktop.workbench.update(instance.workbenchInstanceId, next);
  })()`);
}

export async function openPreviewResource(evaluate, portablePath) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const active = projection.window.activeTarget;
    if (active.kind !== 'project') throw new Error('Preview fixture Project is not active.');
    const tab = projection.window.tabs.find((candidate) => candidate.tabId === active.tabId);
    if (!tab) throw new Error('Preview fixture Project Tab is missing.');
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === tab.projectId,
    );
    if (!project) throw new Error('Preview fixture Project is missing.');
    const identity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId: projection.window.windowId,
      viewId: 'resource-browser:' + tab.viewId,
      viewInstanceId: tab.viewInstanceId,
      rendererSessionId: projection.rendererSessionId,
    };
    await window.openNekoDesktop.resources.getSnapshot({
      requestId: crypto.randomUUID(),
      identity,
      route: 'snapshot.get',
    });
    const search = await window.openNekoDesktop.resources.search({
      requestId: crypto.randomUUID(),
      identity,
      route: 'search',
      source: 'files',
      query: ${JSON.stringify(portablePath)},
      limit: 100,
    });
    const item = search.items.find(
      (candidate) => candidate.locator?.kind === 'workspace-file' &&
        candidate.locator.path === ${JSON.stringify(portablePath)},
    );
    if (!item) throw new Error('Preview fixture Resource was not found: ' + ${JSON.stringify(portablePath)});
    await window.openNekoDesktop.resources.execute({
      requestId: crypto.randomUUID(),
      identity,
      route: 'preview',
      resourceId: item.resourceId,
      targetPreview: {
        viewId: 'preview:' + tab.viewId + ':temporary',
        presentation: 'temporary',
      },
    });
    return { item: { resourceId: item.resourceId, label: item.label }, identity };
  })()`);
}

export async function readFetchStatus(evaluate, url) {
  return evaluate(`(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      try {
        const response = await fetch(${JSON.stringify(url)}, { signal: controller.signal });
        const status = response.status;
        await response.body?.cancel();
        return status;
      } catch {
        return 0;
      }
    } finally {
      clearTimeout(timeout);
    }
  })()`);
}
