import { WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { generalWhatsappLink, orderLink } from '@/lib/site';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const sizeClasses: Record<Size, string> = {
  xs: 'gap-1.5 px-2.5 py-2 text-xs leading-tight',
  sm: 'gap-2 px-4 py-2.5 text-sm',
  md: 'h-12 gap-2.5 px-5 text-[15px]',
  lg: 'h-14 gap-3 px-7 text-lg',
};

const iconSize: Record<Size, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

interface WhatsAppButtonProps {
  /** When given, the message is pre-filled with an order request for this product. */
  productName?: string;
  /** Appended to the order message — used for the buyer's Sabrina model. */
  orderNote?: string;
  label?: string;
  size?: Size;
  variant?: 'solid' | 'outline';
  className?: string;
}

export function WhatsAppButton({
  productName,
  orderNote,
  label = 'הזמנה בוואטסאפ',
  size = 'md',
  variant = 'solid',
  className = '',
}: WhatsAppButtonProps) {
  const href = productName ? orderLink(productName, orderNote) : generalWhatsappLink;

  const variantClasses =
    variant === 'solid'
      ? 'bg-[#25D366] text-mist-100 hover:bg-[#1fbe5a]'
      : 'border border-ink-700 bg-white text-mist-100 hover:border-[#1a9e4f] hover:text-[#157a3d] [&>svg]:text-[#1a9e4f]';

  return (
    <WhatsAppLink
      href={href}
      className={`inline-flex items-center justify-center rounded-xl font-bold transition-colors duration-200 ${sizeClasses[size]} ${variantClasses} ${className}`}
    >
      <WhatsAppIcon className={iconSize[size]} />
      <span>{label}</span>
    </WhatsAppLink>
  );
}
