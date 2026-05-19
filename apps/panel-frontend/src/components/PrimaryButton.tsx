import { Button, type ButtonProps } from '@mantine/core';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

const CYAN = '#7DD3FC';
const GROUND = '#08101A';

interface Props extends Omit<ButtonProps, 'children'>, Omit<ComponentPropsWithoutRef<'button'>, keyof ButtonProps | 'children'> {
  children: ReactNode;
}

/**
 * Standard "create"/"primary action" button: solid cyan with dark text,
 * 500 weight, 12px uppercase letters with mono letter-spacing, 36px height.
 * Use everywhere a hero CTA appears so the Create / Add buttons look
 * identical across pages.
 */
export function PrimaryButton({ children, style, ...rest }: Props) {
  return (
    <Button
      {...rest}
      style={{
        backgroundColor: CYAN,
        color: GROUND,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontSize: 12,
        height: 36,
        ...style,
      }}
    >
      {children}
    </Button>
  );
}
