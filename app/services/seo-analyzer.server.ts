import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export interface SEOIssue {
  id: string;
  type: "critical" | "warning" | "info" | "success";
  category: "content" | "performance" | "accessibility" | "technical";
  title: string;
  description: string;
  affectedPages?: number;
  resourceType?: string;
  resourceId?: string;
  fixable: boolean;
}

export interface SEOAnalysisResult {
  overallScore: number;
  contentScore: number;
  performanceScore: number;
  accessibilityScore: number;
  criticalIssues: number;
  improvements: number;
  goodResults: number;
  issues: SEOIssue[];
  crawledPages: number;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  images: {
    edges: Array<{
      node: {
        url: string;
        altText: string | null;
      };
    }>;
  };
}

interface CollectionNode {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  image: {
    url: string;
    altText: string | null;
  } | null;
}

interface PageNode {
  id: string;
  title: string;
  handle: string;
  body: string;
}

interface ArticleNode {
  id: string;
  title: string;
  handle: string;
  contentHtml: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  image: {
    url: string;
    altText: string | null;
  } | null;
}

export async function analyzeStoreSEO(
  admin: any,
  shop: string
): Promise<SEOAnalysisResult> {
  const issues: SEOIssue[] = [];
  let crawledPages = 0;

  // Fetch products
  const productsResponse = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            seo {
              title
              description
            }
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `);
  const productsData = await productsResponse.json();
  const products: ProductNode[] = productsData.data?.products?.edges?.map((e: any) => e.node) || [];

  // Fetch collections
  const collectionsResponse = await admin.graphql(`
    query {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            seo {
              title
              description
            }
            image {
              url
              altText
            }
          }
        }
      }
    }
  `);
  const collectionsData = await collectionsResponse.json();
  const collections: CollectionNode[] = collectionsData.data?.collections?.edges?.map((e: any) => e.node) || [];

  // Fetch pages
  const pagesResponse = await admin.graphql(`
    query {
      pages(first: 50) {
        edges {
          node {
            id
            title
            handle
            body
          }
        }
      }
    }
  `);
  const pagesData = await pagesResponse.json();
  const pages: PageNode[] = pagesData.data?.pages?.edges?.map((e: any) => e.node) || [];

  // Fetch blog articles
  const blogsResponse = await admin.graphql(`
    query {
      blogs(first: 10) {
        edges {
          node {
            articles(first: 20) {
              edges {
                node {
                  id
                  title
                  handle
                  contentHtml
                  seo {
                    title
                    description
                  }
                  image {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  `);
  const blogsData = await blogsResponse.json();
  const articles: ArticleNode[] = [];
  blogsData.data?.blogs?.edges?.forEach((blog: any) => {
    blog.node.articles?.edges?.forEach((article: any) => {
      articles.push(article.node);
    });
  });

  crawledPages = products.length + collections.length + pages.length + articles.length;

  // Analyze Products
  let productsMissingMetaTitle = 0;
  let productsMissingMetaDescription = 0;
  let productsMissingAltText = 0;
  let productsShortDescription = 0;

  products.forEach((product) => {
    if (!product.seo.title && !product.title) {
      productsMissingMetaTitle++;
    }
    if (!product.seo.description) {
      productsMissingMetaDescription++;
    }
    if (product.descriptionHtml && product.descriptionHtml.length < 100) {
      productsShortDescription++;
    }

    // Check images for alt text
    const imagesWithoutAlt = product.images.edges.filter(
      (img) => !img.node.altText
    ).length;
    if (imagesWithoutAlt > 0) {
      productsMissingAltText += imagesWithoutAlt;
    }
    if (product.featuredImage && !product.featuredImage.altText) {
      productsMissingAltText++;
    }
  });

  // Analyze Collections
  let collectionsMissingMetaTitle = 0;
  let collectionsMissingMetaDescription = 0;
  let collectionsMissingDescription = 0;

  collections.forEach((collection) => {
    if (!collection.seo.title) {
      collectionsMissingMetaTitle++;
    }
    if (!collection.seo.description) {
      collectionsMissingMetaDescription++;
    }
    if (!collection.descriptionHtml || collection.descriptionHtml.length < 50) {
      collectionsMissingDescription++;
    }
  });

  // Analyze Pages
  let pagesMissingContent = 0;
  pages.forEach((page) => {
    if (!page.body || page.body.length < 100) {
      pagesMissingContent++;
    }
  });

  // Analyze Articles
  let articlesMissingMetaTitle = 0;
  let articlesMissingMetaDescription = 0;
  let articlesShortContent = 0;

  articles.forEach((article) => {
    if (!article.seo?.title) {
      articlesMissingMetaTitle++;
    }
    if (!article.seo?.description) {
      articlesMissingMetaDescription++;
    }
    if (article.contentHtml && article.contentHtml.length < 500) {
      articlesShortContent++;
    }
  });

  // Generate Issues
  if (productsMissingMetaTitle > 0) {
    issues.push({
      id: "products-meta-title",
      type: "critical",
      category: "content",
      title: "Products missing meta title",
      description: "Meta titles help search engines understand your product pages and improve click-through rates.",
      affectedPages: productsMissingMetaTitle,
      resourceType: "product",
      fixable: true,
    });
  }

  if (productsMissingMetaDescription > 0) {
    issues.push({
      id: "products-meta-description",
      type: "critical",
      category: "content",
      title: "Products missing meta description",
      description: "Meta descriptions appear in search results and encourage users to click on your products.",
      affectedPages: productsMissingMetaDescription,
      resourceType: "product",
      fixable: true,
    });
  }

  if (productsMissingAltText > 0) {
    issues.push({
      id: "products-alt-text",
      type: "warning",
      category: "accessibility",
      title: "Product images missing alt text",
      description: "Alt text improves accessibility and helps search engines understand your images.",
      affectedPages: productsMissingAltText,
      resourceType: "product",
      fixable: true,
    });
  }

  if (productsShortDescription > 0) {
    issues.push({
      id: "products-short-description",
      type: "warning",
      category: "content",
      title: "Products with short descriptions",
      description: "Longer, detailed product descriptions can improve SEO and conversions.",
      affectedPages: productsShortDescription,
      resourceType: "product",
      fixable: true,
    });
  }

  if (collectionsMissingMetaTitle > 0) {
    issues.push({
      id: "collections-meta-title",
      type: "critical",
      category: "content",
      title: "Collections missing meta title",
      description: "Collection meta titles help category pages rank in search results.",
      affectedPages: collectionsMissingMetaTitle,
      resourceType: "collection",
      fixable: true,
    });
  }

  if (collectionsMissingMetaDescription > 0) {
    issues.push({
      id: "collections-meta-description",
      type: "warning",
      category: "content",
      title: "Collections missing meta description",
      description: "Meta descriptions for collections improve their visibility in search results.",
      affectedPages: collectionsMissingMetaDescription,
      resourceType: "collection",
      fixable: true,
    });
  }

  if (collectionsMissingDescription > 0) {
    issues.push({
      id: "collections-description",
      type: "warning",
      category: "content",
      title: "Collections missing description",
      description: "Collection descriptions provide context for search engines and customers.",
      affectedPages: collectionsMissingDescription,
      resourceType: "collection",
      fixable: true,
    });
  }

  if (pagesMissingContent > 0) {
    issues.push({
      id: "pages-content",
      type: "warning",
      category: "content",
      title: "Pages with insufficient content",
      description: "Pages need substantial content to rank well in search results.",
      affectedPages: pagesMissingContent,
      resourceType: "page",
      fixable: true,
    });
  }

  if (articlesMissingMetaTitle > 0) {
    issues.push({
      id: "articles-meta-title",
      type: "warning",
      category: "content",
      title: "Blog posts missing meta title",
      description: "Blog post meta titles help your content rank for target keywords.",
      affectedPages: articlesMissingMetaTitle,
      resourceType: "article",
      fixable: true,
    });
  }

  if (articlesMissingMetaDescription > 0) {
    issues.push({
      id: "articles-meta-description",
      type: "warning",
      category: "content",
      title: "Blog posts missing meta description",
      description: "Meta descriptions encourage clicks from search results.",
      affectedPages: articlesMissingMetaDescription,
      resourceType: "article",
      fixable: true,
    });
  }

  if (articlesShortContent > 0) {
    issues.push({
      id: "articles-short-content",
      type: "warning",
      category: "content",
      title: "Blog posts with short content",
      description: "Longer, comprehensive blog posts tend to rank better in search results.",
      affectedPages: articlesShortContent,
      resourceType: "article",
      fixable: true,
    });
  }

  // Add good results
  const goodResults: SEOIssue[] = [];

  if (productsMissingMetaTitle === 0 && products.length > 0) {
    goodResults.push({
      id: "products-meta-title-good",
      type: "success",
      category: "content",
      title: "All products have meta titles",
      description: "Great! Your products are optimized with meta titles.",
      fixable: false,
    });
  }

  if (productsMissingAltText === 0 && products.length > 0) {
    goodResults.push({
      id: "products-alt-text-good",
      type: "success",
      category: "accessibility",
      title: "All product images have alt text",
      description: "Excellent! Your product images are accessible and SEO-friendly.",
      fixable: false,
    });
  }

  // Calculate scores
  const criticalIssues = issues.filter((i) => i.type === "critical").length;
  const warnings = issues.filter((i) => i.type === "warning").length;

  // Score calculation
  let contentScore = 100 - (criticalIssues * 15) - (warnings * 5);
  contentScore = Math.max(0, Math.min(100, contentScore));

  let accessibilityScore = productsMissingAltText > 0 ? 100 - (productsMissingAltText * 2) : 100;
  accessibilityScore = Math.max(0, Math.min(100, accessibilityScore));

  const performanceScore = 80; // Placeholder - would require actual performance testing
  const overallScore = Math.round((contentScore + accessibilityScore + performanceScore) / 3);

  return {
    overallScore,
    contentScore,
    performanceScore,
    accessibilityScore,
    criticalIssues,
    improvements: warnings,
    goodResults: goodResults.length,
    issues: [...issues, ...goodResults],
    crawledPages,
  };
}

export async function saveAnalysisResult(
  shop: string,
  result: SEOAnalysisResult
): Promise<void> {
  // Get or create store
  let store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    store = await prisma.store.create({
      data: { shop },
    });
  }

  // Save scan result
  await prisma.sEOScan.create({
    data: {
      storeId: store.id,
      overallScore: result.overallScore,
      contentScore: result.contentScore,
      performanceScore: result.performanceScore,
      accessibilityScore: result.accessibilityScore,
      criticalIssues: result.criticalIssues,
      improvements: result.improvements,
      goodResults: result.goodResults,
      issues: result.issues as any,
      crawledPages: result.crawledPages,
    },
  });

  // Update store's SEO score
  await prisma.store.update({
    where: { id: store.id },
    data: {
      seoScore: result.overallScore,
      lastScanAt: new Date(),
    },
  });
}

export async function getLatestScan(shop: string) {
  const store = await prisma.store.findUnique({
    where: { shop },
    include: {
      seoScans: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return store?.seoScans[0] || null;
}
