import { existsSync } from 'node:fs';
import { AppDatabase } from './app-database.mjs';
import { ProjectDatabase } from './project-database.mjs';
import {
  APP_VERSION,
  APPLICATION_NAME,
  PROJECT_EXTENSION,
  appHome,
  defaultProjectPath,
  normalizeProjectPath,
} from './util.mjs';

export class ProjectService {
  constructor(options = {}) {
    this.appDatabase = new AppDatabase(options.home || appHome());
    this.project = null;
  }

  openInitial(projectPath = null) {
    if (projectPath) return this.openProject(projectPath);
    const recent = this.appDatabase.listRecentProjects().find((item) => !item.missing);
    if (recent) return this.openProject(recent.path);
    const demoPath = defaultProjectPath('RouteCore Demonstration');
    if (existsSync(demoPath)) return this.openProject(demoPath);
    return this.createProject({ path: demoPath, name: 'RouteCore Demonstration', template: 'sample' });
  }

  close() {
    this.project?.close();
    this.project = null;
    this.appDatabase.close();
  }

  requireProject() {
    if (!this.project) throw new Error('No project is open.');
    return this.project;
  }

  createProject(input = {}) {
    const path = normalizeProjectPath(input.path, input.name || 'Untitled Harness');
    this.project?.close();
    this.project = ProjectDatabase.create(path, {
      name: input.name || 'Untitled Harness',
      description: input.description || '',
      organization: input.organization || '',
      template: input.template || 'blank',
    });
    const meta = this.project.getMeta();
    this.appDatabase.recordRecentProject(meta, path);
    return this.project.getWorkspace();
  }

  openProject(path) {
    const normalized = normalizeProjectPath(path);
    if (!existsSync(normalized)) throw new Error(`Project file does not exist: ${normalized}`);
    this.project?.close();
    this.project = new ProjectDatabase(normalized);
    const meta = this.project.getMeta();
    this.appDatabase.recordRecentProject(meta, normalized);
    return this.project.getWorkspace();
  }

  bootstrap() {
    const project = this.requireProject();
    return {
      application: {
        name: APPLICATION_NAME,
        version: APP_VERSION,
        offline: true,
        networkPolicy: 'loopback-only',
        projectFormat: `SQLite ${PROJECT_EXTENSION} (legacy .ohcad supported)`,
      },
      settings: this.appDatabase.getSettings(),
      recentProjects: this.appDatabase.listRecentProjects(),
      workspace: project.getWorkspace(),
      library: {
        components: this.appDatabase.listComponents(),
        cables: this.appDatabase.listCables(),
      },
    };
  }
}
