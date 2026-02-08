#!/bin/bash
# AirTime SSL Certificate Setup Script
# Generates self-signed certificates for local HTTPS access

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SSL_DIR="$SCRIPT_DIR"
CERT_FILE="$SSL_DIR/cert.pem"
KEY_FILE="$SSL_DIR/key.pem"

echo "=========================================="
echo "  AirTime SSL Certificate Setup"
echo "=========================================="
echo ""

# Create ssl directory if it doesn't exist
if [ ! -d "$SSL_DIR" ]; then
    echo -e "${YELLOW}Creating ssl directory...${NC}"
    mkdir -p "$SSL_DIR"
    echo -e "${GREEN}✓${NC} SSL directory created"
else
    echo -e "${GREEN}✓${NC} SSL directory exists"
fi

# Check if certificates already exist
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo ""
    echo -e "${YELLOW}Warning: SSL certificates already exist${NC}"
    echo "  Certificate: $CERT_FILE"
    echo "  Private key: $KEY_FILE"
    echo ""
    read -p "Do you want to regenerate them? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled. Keeping existing certificates."
        exit 0
    fi

    echo ""
    echo -e "${YELLOW}Removing old certificates...${NC}"
    rm -f "$CERT_FILE" "$KEY_FILE"
    echo -e "${GREEN}✓${NC} Old certificates removed"
fi

echo ""
echo -e "${YELLOW}Generating self-signed SSL certificate...${NC}"
echo "  Valid for: 10 years"
echo "  Hostnames: time.local, localhost, 127.0.0.1, 192.168.7.12"
echo ""

# Create OpenSSL config for SAN (Subject Alternative Names)
cat > "$SSL_DIR/openssl.cnf" <<EOF
[req]
default_bits       = 4096
default_md         = sha256
distinguished_name = req_distinguished_name
x509_extensions    = v3_req
prompt             = no

[req_distinguished_name]
C  = US
ST = State
L  = City
O  = AirTime
CN = time.local

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = time.local
DNS.2 = localhost
IP.1  = 127.0.0.1
IP.2  = 192.168.7.12
EOF

# Generate the certificate
openssl req -x509 \
    -newkey rsa:4096 \
    -nodes \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 3650 \
    -config "$SSL_DIR/openssl.cnf" \
    -extensions v3_req \
    > /dev/null 2>&1

# Clean up config file
rm "$SSL_DIR/openssl.cnf"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo -e "${GREEN}✓${NC} SSL certificate generated successfully"
echo ""
echo "Certificate details:"
openssl x509 -in "$CERT_FILE" -noout -text | grep -A 1 "Subject:"
openssl x509 -in "$CERT_FILE" -noout -text | grep -A 3 "Subject Alternative Name"
echo ""
echo "Files created:"
echo "  Certificate: $CERT_FILE"
echo "  Private key: $KEY_FILE"
echo ""
echo "=========================================="
echo -e "${GREEN}  SSL Setup Complete!${NC}"
echo "=========================================="
echo ""
