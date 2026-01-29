export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type ServiceDiscovery = {
  allServices: string[];
  longrunServices: string[];
};
