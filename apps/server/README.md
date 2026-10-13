<h1 align="center">Pi-Tray Server</h1>
<p align="center">
    <img src="./icon.svg" />
</p>

---

this readme needs to be done properly, but this isnt in working order yet so come back later :)

once the editor program gets up and running, its going to manage a bit of this for you, especially plugin-env

## Setup (make this better)

1. Clone the repository:
   ```bash
    git clone https://github.com/Pi-Tray/server.git pi-tray-server
    cd pi-tray-server
    ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate `plugin-env`:
   ```bash
   npm run plugin:setup
   ```
4. Decide on a port you want the server to run on. By default this is 8080.
5. Create a connection between the Pi and the computer the server runs on. For me, I connect the Pi directly over Ethernet and assign it a static IP. (I should really do a writeup about this)
6. Determine the IP address of the interface that connects to your Pi. You probably don't want to be serving this on the public Internet, so I'd avoid `0.0.0.0`. Ths interface IP will be the same one you assigned to the interface if you used a direct connection.
7. You can now run the server with:
   ```bash
   npm run start -- -- --host=<host-ip> --port=<port>
   ``` 
   You'll probably want to run this at startup, but that depends on your OS.
8. You can now configure and subsequently build the [Pi-Tray client](https://github.com/Pi-Tray/client) to connect to this server by setting the `VITE_WS_URL` environment variable in the client. This should be the URL of the server you just started, i.e., `ws://<host-ip>:<port>`.
9. Ensure the Pi can actually access the server! If you're directly connected, you'll probably need to make an exception in your OS firewall to allow the Pi to send inbound traffic on the port you chose.

## Installing plugins

You can use the `npm run plugin:npm` command in the server's root to run npm in the `plugin-env` directory.

For example, you can install a plugin with your package manager following its README, e.g.
```bash
npm run plugin:npm install https://github.com/Pi-Tray/ghost-plugins#release
 ```

Alternatively, follow the next section to change directly into the `plugin-env` directory and run npm commands normally there.

## Changing into the `plugin-env`:

Bash / PowerShell:
```bash
cd "$(npm run where:plugin-env --silent)"
```

Manual: copy the output of `npm run where:plugin-env --silent` and `cd` into that directory.
