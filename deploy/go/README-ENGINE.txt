# Go Engine Placement

Place your compiled Go engine binary here:

- **Windows**: `deploy/go/engine-go.exe`
- **Linux**: `deploy/go/engine-go` (make sure it is executable: `chmod +x deploy/go/engine-go`)

The Electron app will auto-detect this binary in production (from `resources/deploy/go/…`) and in development (relative to the project root).
You can also override with environment variable:

```bash
# Windows (PowerShell)
$env:ENGINE_GO_PATH = "C:\path\to\engine-go.exe"; npm start

# Linux
ENGINE_GO_PATH=/absolute/path/to/engine-go npm start
```

> The Go program expects **Master.xlsx** and **TemplateOutput.xlsx** to be discoverable.
> Put them next to the engine binary or in the working directory. Electron sets the working directory to the binary's folder when running.
