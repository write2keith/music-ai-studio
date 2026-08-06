#!/bin/bash

# Install backend dependencies
pip install --break-system-packages -r backend/requirements.txt

# Check CUDA availability
echo "=== Checking GPU ==="
python3 -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"

echo ""
echo "=== Setup Complete ==="
echo "Run the app with: ./start.sh"
