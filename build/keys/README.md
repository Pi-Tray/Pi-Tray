# Client update keys

Pis only install a client update signed by a key in `allowed_signers`, using OpenSSH's file signatures (`ssh-keygen -Y`).
Each key is limited to one namespace, so the tool itself enforces what it can sign:

| Key        | Namespace                            | Signs                        | Kept                                       |
|------------|--------------------------------------|------------------------------|--------------------------------------------|
| `release`  | `client-update@pi-tray.ollieg.codes` | `client-manifest.json`       | the `CLIENT_SIGNING_KEY` secret of the `release` environment |
| `recovery` | `trusted-keys@pi-tray.ollieg.codes`  | `allowed_signers` itself     | offline only                               |

`allowed_signers` starts with `# serial <n>`. A pi only accepts a new one that the recovery key signed and that has a
higher serial, so a stolen release key can't change which keys are trusted.

## Making the keys (once)

Run in Git Bash or any shell with OpenSSH:

```sh
key_dir=$(mktemp -d)

ssh-keygen -q -t ed25519 -N "" -C "pi-tray release" -f "$key_dir/release"
ssh-keygen -q -t ed25519 -N "" -C "pi-tray recovery" -f "$key_dir/recovery"

{
    echo "# serial 1"
    echo "release namespaces=\"client-update@pi-tray.ollieg.codes\" $(cut -d' ' -f1,2 "$key_dir/release.pub")"
    echo "recovery namespaces=\"trusted-keys@pi-tray.ollieg.codes\" $(cut -d' ' -f1,2 "$key_dir/recovery.pub")"
} > build/keys/allowed_signers

ssh-keygen -Y sign -f "$key_dir/recovery" -n trusted-keys@pi-tray.ollieg.codes build/keys/allowed_signers

cat "$key_dir/release"
cat "$key_dir/recovery"
rm -rf "$key_dir"
```

Save the two private keys printed at the end before closing the terminal:
- release: the `CLIENT_SIGNING_KEY` secret of the `release` environment, plus a copy in your password manager
- recovery: your password manager only, plus a printed copy

Then commit `allowed_signers` and `allowed_signers.sig`.

## Replacing the release key

Make a new release key as above, then put it in `allowed_signers` with the serial one higher, sign it with the recovery
key, commit, and update the secret. Every pi drops the old key with the next update.

```sh
ssh-keygen -Y sign -f recovery -n trusted-keys@pi-tray.ollieg.codes build/keys/allowed_signers
```

## Checking

```sh
ssh-keygen -Y verify -f build/keys/allowed_signers -I recovery -n trusted-keys@pi-tray.ollieg.codes -s build/keys/allowed_signers.sig < build/keys/allowed_signers
```
