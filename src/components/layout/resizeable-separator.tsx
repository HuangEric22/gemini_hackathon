import { Separator } from 'react-resizable-panels';

export function ResizeSeparator() {
  return (
    <Separator className="group relative w-1 h-full transition-all outline-none
      bg-gray-400
      [&[data-separator='hover']]:bg-indigo-600
      [&[data-separator='active']]:bg-indigo-400
    "/>
  );
}
