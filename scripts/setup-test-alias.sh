#!/bin/bash
# Setup script to create an alias for bun test that filters out Jest files

echo "Setting up bun test alias..."

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
  SHELL_RC="$HOME/.zshrc"
  SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
  SHELL_RC="$HOME/.bashrc"
  SHELL_NAME="bash"
else
  echo "Unsupported shell. Please manually add the alias."
  exit 1
fi

# Check if alias already exists
if grep -q "alias bun='_bun_wrapper'" "$SHELL_RC" 2>/dev/null; then
  echo "Alias already exists in $SHELL_RC"
  exit 0
fi

# Add the wrapper function and alias
cat >> "$SHELL_RC" << 'EOF'

# Bun test wrapper to filter out Jest files
_bun_wrapper() {
  if [ "$1" = "test" ] && [ -z "$2" ]; then
    echo "⚠️  Use 'bun run test' instead of 'bun test' to run the full test suite"
    echo "   Or specify files: bun run test <specific-file>"
    return 1
  else
    command bun "$@"
  fi
}

# Override bun command
alias bun='_bun_wrapper'
EOF

echo "✅ Added bun test wrapper to $SHELL_RC"
echo ""
echo "To activate the alias, run:"
echo "  source $SHELL_RC"
echo ""
echo "Or start a new terminal session."