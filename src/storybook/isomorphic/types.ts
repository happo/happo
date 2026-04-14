interface SkipItem {
  component: string;
  variant: string;
}

export type SkipItems = Array<SkipItem>;

interface OnlyItem {
  component: string;
}

export type OnlyItems = Array<OnlyItem>;
