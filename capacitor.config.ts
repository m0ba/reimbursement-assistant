import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.haozihao.reimbursement',
  appName: '报销助手',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#F2F2F7',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
