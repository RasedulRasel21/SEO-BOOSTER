import prisma from "~/db.server";

export interface ProductStructuredData {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  brand?: {
    "@type": "Brand";
    name: string;
  };
  offers?: {
    "@type": "Offer";
    url: string;
    priceCurrency: string;
    price: string;
    availability: string;
    seller?: {
      "@type": "Organization";
      name: string;
    };
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: string;
    reviewCount: string;
  };
}

export interface OrganizationStructuredData {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo?: string;
  sameAs?: string[];
  contactPoint?: {
    "@type": "ContactPoint";
    telephone?: string;
    contactType?: string;
  };
}

export interface LocalBusinessStructuredData {
  "@context": "https://schema.org";
  "@type": string;
  name: string;
  image?: string;
  "@id"?: string;
  url?: string;
  telephone?: string;
  priceRange?: string;
  address?: {
    "@type": "PostalAddress";
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  geo?: {
    "@type": "GeoCoordinates";
    latitude?: number;
    longitude?: number;
  };
  openingHoursSpecification?: Array<{
    "@type": "OpeningHoursSpecification";
    dayOfWeek: string | string[];
    opens: string;
    closes: string;
  }>;
}

export interface BreadcrumbStructuredData {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item?: string;
  }>;
}

export interface ArticleStructuredData {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description?: string;
  image?: string | string[];
  datePublished?: string;
  dateModified?: string;
  author?: {
    "@type": "Person" | "Organization";
    name: string;
  };
  publisher?: {
    "@type": "Organization";
    name: string;
    logo?: {
      "@type": "ImageObject";
      url: string;
    };
  };
}

export interface FAQStructuredData {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: {
      "@type": "Answer";
      text: string;
    };
  }>;
}

export interface CollectionStructuredData {
  "@context": "https://schema.org";
  "@type": "CollectionPage";
  name: string;
  description?: string;
  url?: string;
}

export function generateProductStructuredData(product: {
  title: string;
  description?: string;
  images?: string[];
  sku?: string;
  vendor?: string;
  price?: string;
  currency?: string;
  url?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  rating?: number;
  reviewCount?: number;
  shopName?: string;
}): ProductStructuredData {
  const data: ProductStructuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
  };

  if (product.description) {
    data.description = product.description;
  }

  if (product.images?.length) {
    data.image = product.images.length === 1 ? product.images[0] : product.images;
  }

  if (product.sku) {
    data.sku = product.sku;
  }

  if (product.vendor) {
    data.brand = {
      "@type": "Brand",
      name: product.vendor,
    };
  }

  if (product.price && product.currency) {
    data.offers = {
      "@type": "Offer",
      url: product.url || "",
      priceCurrency: product.currency,
      price: product.price,
      availability: `https://schema.org/${product.availability || "InStock"}`,
    };

    if (product.shopName) {
      data.offers.seller = {
        "@type": "Organization",
        name: product.shopName,
      };
    }
  }

  if (product.rating && product.reviewCount) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating.toString(),
      reviewCount: product.reviewCount.toString(),
    };
  }

  return data;
}

export function generateOrganizationStructuredData(org: {
  name: string;
  url: string;
  logo?: string;
  socialLinks?: string[];
  telephone?: string;
}): OrganizationStructuredData {
  const data: OrganizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    url: org.url,
  };

  if (org.logo) {
    data.logo = org.logo;
  }

  if (org.socialLinks?.length) {
    data.sameAs = org.socialLinks;
  }

  if (org.telephone) {
    data.contactPoint = {
      "@type": "ContactPoint",
      telephone: org.telephone,
      contactType: "customer service",
    };
  }

  return data;
}

export function generateLocalBusinessStructuredData(
  business: {
    name: string;
    type?: string;
    url?: string;
    image?: string;
    telephone?: string;
    priceRange?: string;
    address?: {
      street?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      country?: string;
    };
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    hours?: Array<{
      days: string[];
      opens: string;
      closes: string;
    }>;
  }
): LocalBusinessStructuredData {
  const data: LocalBusinessStructuredData = {
    "@context": "https://schema.org",
    "@type": business.type || "LocalBusiness",
    name: business.name,
  };

  if (business.url) {
    data.url = business.url;
    data["@id"] = business.url;
  }

  if (business.image) {
    data.image = business.image;
  }

  if (business.telephone) {
    data.telephone = business.telephone;
  }

  if (business.priceRange) {
    data.priceRange = business.priceRange;
  }

  if (business.address) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: business.address.street,
      addressLocality: business.address.city,
      addressRegion: business.address.region,
      postalCode: business.address.postalCode,
      addressCountry: business.address.country,
    };
  }

  if (business.coordinates) {
    data.geo = {
      "@type": "GeoCoordinates",
      latitude: business.coordinates.latitude,
      longitude: business.coordinates.longitude,
    };
  }

  if (business.hours?.length) {
    data.openingHoursSpecification = business.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  return data;
}

export function generateBreadcrumbStructuredData(
  items: Array<{ name: string; url?: string }>
): BreadcrumbStructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

export function generateArticleStructuredData(article: {
  title: string;
  description?: string;
  images?: string[];
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  publisherName?: string;
  publisherLogo?: string;
}): ArticleStructuredData {
  const data: ArticleStructuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
  };

  if (article.description) {
    data.description = article.description;
  }

  if (article.images?.length) {
    data.image = article.images.length === 1 ? article.images[0] : article.images;
  }

  if (article.datePublished) {
    data.datePublished = article.datePublished;
  }

  if (article.dateModified) {
    data.dateModified = article.dateModified;
  }

  if (article.authorName) {
    data.author = {
      "@type": "Person",
      name: article.authorName,
    };
  }

  if (article.publisherName) {
    data.publisher = {
      "@type": "Organization",
      name: article.publisherName,
    };

    if (article.publisherLogo) {
      data.publisher.logo = {
        "@type": "ImageObject",
        url: article.publisherLogo,
      };
    }
  }

  return data;
}

export function generateFAQStructuredData(
  faqs: Array<{ question: string; answer: string }>
): FAQStructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// Database operations
export async function saveStructuredData(
  storeId: string,
  type: string,
  jsonLd: object,
  resourceType?: string,
  resourceId?: string
) {
  return prisma.structuredData.upsert({
    where: {
      id: resourceId ? `${storeId}-${type}-${resourceId}` : `${storeId}-${type}`,
    },
    create: {
      id: resourceId ? `${storeId}-${type}-${resourceId}` : `${storeId}-${type}`,
      storeId,
      type,
      resourceType,
      resourceId,
      jsonLd: jsonLd as any,
      isEnabled: true,
    },
    update: {
      jsonLd: jsonLd as any,
    },
  });
}

export async function getStructuredData(storeId: string, type?: string) {
  return prisma.structuredData.findMany({
    where: {
      storeId,
      ...(type ? { type } : {}),
    },
  });
}

export async function toggleStructuredData(id: string, isEnabled: boolean) {
  return prisma.structuredData.update({
    where: { id },
    data: { isEnabled },
  });
}
