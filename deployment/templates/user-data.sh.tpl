#!/bin/bash
# Lightsail launch script (user_data). Runs once as root at first boot.
#
# We deliberately do NOT use a #cloud-config here: Lightsail does not reliably
# apply cloud-init's ssh_authorized_keys / default-user modules, so the key
# never lands in admin's authorized_keys and Ansible can't connect. A plain
# bash script is the mechanism Lightsail runs dependably (and cloud-init, if
# present, also executes #! user-data scripts), so it works either way.
#
# Both heredocs are quoted ('PUBKEY' / 'VAULT') so the shell does not expand
# anything inside them — critical for the vault ciphertext, which contains a
# literal "$ANSIBLE_VAULT" marker.
set -euo pipefail

# --- SSH access for Ansible (Debian's default Lightsail user is "admin") ---
install -d -m 0700 -o admin -g admin /home/admin/.ssh
cat > /home/admin/.ssh/authorized_keys <<'PUBKEY'
${public_key}
PUBKEY
chown admin:admin /home/admin/.ssh/authorized_keys
chmod 600 /home/admin/.ssh/authorized_keys

# --- Encrypted secrets, decrypted later by the Ansible playbook ---
install -d -m 0755 /etc/haputele
cat > /etc/haputele/vault.yml <<'VAULT'
${vault_ciphertext}
VAULT
chown root:root /etc/haputele/vault.yml
chmod 600 /etc/haputele/vault.yml
