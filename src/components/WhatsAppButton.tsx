import { WhatsAppIcon } from '@/components/icons';
import { generalWhatsappLink, orderLink } from '@/lib/site';

type Size = 'sm' | 'md' | 'lg';

const sizeClasses: Record<Size, string> = {
  sm: 'gap-2 px-4 py-2.5 text-sm',
  md: 'gap-2.5 px-5 py-3 text-[15px]',
  lg: 'gap-3 px-7 py-4 text-lg',
};

const iconSize: Record<Size, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

interface WhatsAppButtonProps {
  /** When given, the message is pre-filled with an order request for this product. */
  productName?: string;
  label?: string;
  size?: Size;
  variant?: 'solid' | 'outline';
  className?: string;
}

export function WhatsAppButton({
  productName,
  label = 'הזמנה ב-WhatsApp',
  size = 'md',
  variant = 'solid',
  className = '',
}: WhatsAppButtonProps) {
  const href = productName ? orderLink(productName) : generalWhatsappLink;

  const variantClasses =
    variant === 'solid'
      ? 'bg-[#25D366] text-mist-100 hover:bg-[#1fbe5a] shadow-lg shadow-[#25D366]/25'
      : 'border border-[#1da851]/50 text-[#1a9e4f] hover:border-[#1da851] hover:bg-[#25D366]/10';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-full font-bold transition-colors duration-200 ${sizeClasses[size]} ${variantClasses} ${className}`}
    >
      <WhatsAppIcon className={iconSize[size]} />
      <span>{label}</span>
    </a>
  );
}
