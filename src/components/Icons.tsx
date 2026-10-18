type P = { size?: number; className?: string };

const S = ({ size = 22, className, children }: P & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const IconInvoice = (p: P) => (
  <S {...p}>
    <path d="M6 3.5h9l3 3v14l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8.5h6M9 12h6M9 15.5h4" />
  </S>
);

export const IconRoute = (p: P) => (
  <S {...p}>
    <circle cx="6" cy="18.5" r="2.2" />
    <circle cx="18" cy="5.5" r="2.2" />
    <path d="M8.2 18.5h4.3a3 3 0 0 0 0-6H11a3 3 0 0 1 0-6h4.6" />
  </S>
);

export const IconFolder = (p: P) => (
  <S {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l2 2h7.8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </S>
);

export const IconArchive = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.4" />
    <path d="M5 8.5v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
    <path d="M10 12.5h4" />
  </S>
);

export const IconBox = (p: P) => (
  <S {...p}>
    <path d="M12 3.6 20 8v8l-8 4.4L4 16V8z" />
    <path d="M4 8l8 4.4L20 8M12 12.4v8" />
  </S>
);

export const IconGear = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 13.6a7.7 7.7 0 0 0 0-3.2l1.8-1.2-1.9-3.3-2.1.8a7.6 7.6 0 0 0-2.8-1.6L14.1 2H9.9l-.3 2.4a7.6 7.6 0 0 0-2.8 1.6l-2.1-.8L2.8 9.2l1.8 1.2a7.7 7.7 0 0 0 0 3.2l-1.8 1.2 1.9 3.3 2.1-.8a7.6 7.6 0 0 0 2.8 1.6l.3 2.4h4.2l.3-2.4a7.6 7.6 0 0 0 2.8-1.6l2.1.8 1.9-3.3z" />
  </S>
);

export const IconBack = (p: P) => (
  <S {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </S>
);

export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </S>
);

export const IconClock = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.6V12l3 1.8" />
  </S>
);

export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M12 4v10m0 0 3.6-3.6M12 14l-3.6-3.6" />
    <path d="M4.8 17.5v1.2a1.8 1.8 0 0 0 1.8 1.8h10.8a1.8 1.8 0 0 0 1.8-1.8v-1.2" />
  </S>
);

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8h5v1.7M7 6.5l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.2a1.6 1.6 0 0 0 1.6-1.5L17 6.5" />
  </S>
);

export const IconClose = (p: P) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);

export const IconShare = (p: P) => (
  <S {...p}>
    <path d="M12 15.5V4m0 0L8.4 7.6M12 4l3.6 3.6" />
    <path d="M5 13v6.2a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V13" />
  </S>
);

export const IconCopy = (p: P) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.2" />
    <path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9" />
  </S>
);
