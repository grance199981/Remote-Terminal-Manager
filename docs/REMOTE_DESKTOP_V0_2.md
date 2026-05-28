# Remote Desktop v0.2.0 Backends

Remote Terminal Manager v0.2.0 keeps noVNC as an embedded fallback, but the recommended path is no longer to rely on noVNC for daily GUI work.

## Recommended order

1. **xRDP + Windows Remote Desktop**: best default on Windows clients. It uses the native `mstsc.exe` client and is usually smoother than noVNC.
2. **Sunshine + Moonlight**: best for high-frame-rate or graphics-heavy desktop streaming. Requires pairing Moonlight with Sunshine first.
3. **RustDesk**: good when you want an AnyDesk/ToDesk-like external remote-control client.
4. **noVNC**: still available inside the app for emergency browser-based access.

## Ubuntu packages

Ask an administrator to install the package set for the backend you want.

### xRDP

```bash
sudo apt update
sudo apt install -y xrdp xfce4 xfce4-goodies dbus-x11
sudo systemctl enable --now xrdp
```

Then connect to the Tailscale IP on port `3389`.

### noVNC fallback

```bash
sudo apt update
sudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server tigervnc-common novnc websockify dbus-x11 xterm
```

### Sunshine + Moonlight

Install Sunshine on Ubuntu and Moonlight on Windows. Pair Moonlight with the Sunshine host once, then use the app's Moonlight backend to launch the external client.

### RustDesk

Install RustDesk on both Windows and Ubuntu. Record the Ubuntu RustDesk ID, then use the app's RustDesk backend to open the local client.

## Release naming

From this version onward:

- GitHub release tag: `release-v0.2.0`
- Portable executable: `Remote-Terminal-Manager-v0.2.0-portable-x64.exe`
- Build output directory: `apps/desktop/release-v0.2.0/`

