#!/bin/bash

# Fix imports in Jest test files
echo "Fixing imports in Jest test files..."

# Analytics test
sed -i '' 's|from '\''../../../../lib/hooks/use-window-size.client'\''|from '\''../../../../../lib/hooks/use-window-size.client'\''|g' __tests__/jest/components/ui/navigation/navigation.jest.test.tsx

# Code block test  
sed -i '' 's|from '\''../../../lib/hooks/use-window-size.client'\''|from '\''../../../../lib/hooks/use-window-size.client'\''|g' __tests__/jest/components/ui/code-block.jest.test.tsx

# Navigation link test
sed -i '' 's|from '\''../../../../../../components/ui/navigation/navigation-link.client'\''|from '\''../../../../../components/ui/navigation/navigation-link.client'\''|g' __tests__/jest/components/ui/navigation/navigation-link.jest.test.tsx

# Investment card test
sed -i '' 's|from '\''../../../../components/ui/external-link.client'\''|from '\''../../../../../components/ui/external-link.client'\''|g' __tests__/jest/components/features/investments/investment-card.jest.test.tsx
sed -i '' 's|from '\''../../../../components/ui'\''|from '\''../../../../../components/ui'\''|g' __tests__/jest/components/features/investments/investment-card.jest.test.tsx
sed -i '' 's|from '\''../../../../components/ui/financial-metrics.server'\''|from '\''../../../../../components/ui/financial-metrics.server'\''|g' __tests__/jest/components/features/investments/investment-card.jest.test.tsx

# Theme toggle test
sed -i '' 's|from '\''../../../components/ui/theme/theme-toggle'\''|from '\''../../../../components/ui/theme/theme-toggle'\''|g' __tests__/jest/components/ui/theme-toggle.jest.test.tsx

# Logo image test
sed -i '' 's|from '\''../../../components/ui/logo-image.client'\''|from '\''../../../../components/ui/logo-image.client'\''|g' __tests__/jest/components/ui/logo-image.jest.test.tsx

# Aventure icon test
sed -i '' 's|from '\''../../../../components/ui/social-icons/aventure-icon'\''|from '\''../../../../../components/ui/social-icons/aventure-icon'\''|g' __tests__/jest/components/ui/social-icons/aventure-icon.jest.test.tsx

echo "Done fixing Jest imports!"

# Fix imports in Bun test files  
echo "Fixing imports in Bun test files..."

# Fix the over-corrected import paths
sed -i '' 's|from '\''../../../../lib/context/global-window-registry-context.client'\''|from '\''../../../lib/context/global-window-registry-context.client'\''|g' __tests__/bun/app/pages.smoke.test.ts
sed -i '' 's|import.meta.dir, '\''../../../../scripts/update-s3-data.ts'\''|import.meta.dir, '\''../../../scripts/update-s3-data.ts'\''|g' __tests__/bun/scripts/update-s3-data.smoke.test.ts

echo "Done fixing Bun imports!"