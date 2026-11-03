/** Os schemas vivem em `@aagb/shared` para que o servidor valide com as mesmas regras. */
export { donationOfferSchema, orderSchema, serviceRequestSchema, validate } from '@aagb/shared'
export type { DonationOfferForm, FieldErrors, OrderForm, ServiceRequestForm, ValidationResult } from '@aagb/shared'
