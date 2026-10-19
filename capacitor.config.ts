import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.gaellebriet.memopatte',
  appName: 'MémoPatte',
  webDir: 'dist',
  plugins: {
    SystemBars: { insetsHandling: 'native' },
  },
}

export default config
