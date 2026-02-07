# Test Docker Image Action

Generic Docker image testing: starts a container, waits for it to be running, scans logs for common error patterns, and can validate Docker healthchecks and s6-overlay services.

This action is designed for Linux runners with Docker available.

## Quickstart

```yaml
jobs:
  test-image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Test image
        uses: owner/repo@v1
        with:
          image: ghcr.io/org/image:tag
```

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `image` | yes | - | Docker image reference (e.g., `ghcr.io/org/image:tag`). |
| `timeout` | no | `120` | Overall test timeout in seconds. |
| `startupTimeout` | no | `60` | Container startup timeout in seconds. |
| `minimalEnv` | no | `{"PUID":"1000","PGID":"1000","TZ":"UTC"}` | JSON object of environment variables passed into the container. |
| `skipHealthcheck` | no | `false` | Skip healthcheck verification. |
| `skipS6Check` | no | `false` | Skip s6 service verification. |
| `requiredServices` | no | `""` | Comma-separated list of required s6 services (auto-detected if not provided). |
| `errorPatterns` | no | `[]` | Additional error patterns to detect (JSON array of regex strings). |
| `mountDockerSocket` | no | `false` | Mount `/var/run/docker.sock` into container (read-only) when present. |
| `verbose` | no | `false` | Enable verbose logs (adds `[DEBUG]` lines). |

Notes:

- Boolean inputs must be passed as strings (`"true"`/`"false"`).

## Outputs

| Name | Description |
| --- | --- |
| `status` | `success` or `failure`. |
| `logs` | Container logs (string) on failure. |
| `healthcheckDetected` | `true`/`false` string indicating whether a healthcheck was detected. |
| `servicesDetected` | JSON array (string) of detected s6 services. |

## Permissions

No special GitHub permissions are required. Typical workflows only need `contents: read` for checkout.

## Examples

Require specific services and add patterns:

```yaml
- uses: owner/repo@v1
  with:
    image: ghcr.io/org/image:tag
    requiredServices: api,worker
    errorPatterns: '["panic","fatal","out of memory"]'
```

Skip s6 checks (for images without s6-overlay):

```yaml
- uses: owner/repo@v1
  with:
    image: ghcr.io/org/image:tag
    skipS6Check: "true"
```

Pass environment variables:

```yaml
- uses: owner/repo@v1
  with:
    image: ghcr.io/org/image:tag
    minimalEnv: '{"PUID":"1000","PGID":"1000","TZ":"UTC"}'
```

## Troubleshooting

- If the container never reaches `running`, increase `startupTimeout` and/or `timeout`.
- If `minimalEnv`/`errorPatterns` fails to parse, ensure the value is valid JSON (object / array respectively).
- If `mountDockerSocket` is enabled but `/var/run/docker.sock` doesn’t exist on the runner, the action continues without mounting.
- If you need logs in your workflow, use the `logs` output when `status=failure`.

## Security notes

- The action avoids logging environment variable values; it only logs the variable names (keys).
- Mounting the Docker socket effectively grants the container host-level Docker access; enable only when you trust the image.

## License

MIT
