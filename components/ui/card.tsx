/**
 * @fileoverview A set of composable card components for building flexible UI elements.
 * Provides Card, CardHeader, CardTitle, CardDescription, CardContent, and CardFooter.
 * @version 1.0.0
 */
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The main container for a card component. Acts as the root element.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div element attributes.
 * @param {string} [props.className] - Optional additional CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded ref to the underlying div element.
 * @returns {React.JSX.Element} A div element with card styling.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border bg-card text-card-foreground shadow", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/**
 * A header section for a card component. Typically contains CardTitle and CardDescription.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div element attributes.
 * @param {string} [props.className] - Optional additional CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded ref to the underlying div element.
 * @returns {React.JSX.Element} A div element representing the card header.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

/**
 * A title element for a card, intended to be used within a CardHeader.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div element attributes.
 * @param {string} [props.className] - Optional additional CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded ref to the underlying div element.
 * @returns {React.JSX.Element} A div element representing the card title.
 */
const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

/**
 * A description or subtitle element for a card, intended for use within a CardHeader.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div element attributes.
 * @param {string} [props.className] - Optional additional CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded ref to the underlying div element.
 * @returns {React.JSX.Element} A div element representing the card description.
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

/**
 * The main content container for a card.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div element attributes.
 * @param {string} [props.className] - Optional additional CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded ref to the underlying div element.
 * @returns {React.JSX.Element} A div element representing the card's main content area.
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

/**
 * A footer section for a card component.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div element attributes.
 * @param {string} [props.className] - Optional additional CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded ref to the underlying div element.
 * @returns {React.JSX.Element} A div element representing the card footer.
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
