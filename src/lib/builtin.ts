export interface BuiltinFile {
  id: string;
  name: string;
  file: string;
  ext: 'xlsx' | 'pdf';
  desc: string;
  size: string;
}

export const BUILTIN_FILES: BuiltinFile[] = [
  {
    id: 'tieqiandan',
    name: '贴签单',
    file: 'tieqiandan.xlsx',
    ext: 'xlsx',
    desc: '原始凭证贴签，打印后裁剪粘贴',
    size: '12 KB',
  },
];
