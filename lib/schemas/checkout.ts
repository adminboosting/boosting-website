import { quoteRequestSchema, type QuoteRequest } from "@/lib/schemas/quote";

/**
 * Zod schema for the checkout submission. The checkout payload IS a
 * QuoteRequest: the client sends only selections, and the createOrder action
 * re-quotes server-side with computeQuote — client-sent price fields are
 * stripped by the schema exactly like /api/quote. Keeping this a re-export
 * gives calculator → checkout → order creation a single validation source, so
 * nothing money-bearing can ever ride in on the request body.
 */
export const checkoutRequestSchema = quoteRequestSchema;

export type CheckoutRequest = QuoteRequest;
