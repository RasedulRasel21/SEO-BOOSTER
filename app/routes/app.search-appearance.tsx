import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Tabs,
  Box,
  Divider,
  Banner,
  TextField,
  Select,
  Checkbox,
  DataTable,
  EmptyState,
  Modal,
  TextContainer,
  Tag,
  ChoiceList,
  FormLayout,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateMetaTags, generateAltText } from "../services/groq.server";
import {
  generateProductStructuredData,
  generateOrganizationStructuredData,
  generateLocalBusinessStructuredData,
  generateBreadcrumbStructuredData,
  generateArticleStructuredData,
} from "../services/structured-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get or create store
  let store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    store = await prisma.store.create({
      data: { shop },
    });
  }

  // Get meta tags
  const metaTags = await prisma.metaTag.findMany({
    where: { storeId: store.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // Get alt text optimizations count
  const altTextStats = await prisma.altTextOptimization.groupBy({
    by: ["isOptimized"],
    where: { storeId: store.id },
    _count: true,
  });

  const totalAltTexts = altTextStats.reduce((acc, s) => acc + s._count, 0);
  const optimizedAltTexts = altTextStats.find((s) => s.isOptimized)?._count || 0;

  // Get structured data settings
  const structuredData = await prisma.structuredData.findMany({
    where: { storeId: store.id },
  });

  // Get local business info
  const localBusiness = await prisma.localBusiness.findUnique({
    where: { storeId: store.id },
  });

  // Fetch products for meta tag editing
  const productsResponse = await admin.graphql(`
    query {
      products(first: 20) {
        edges {
          node {
            id
            title
            handle
            seo {
              title
              description
            }
            images(first: 5) {
              edges {
                node {
                  id
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
  const products = productsData.data?.products?.edges?.map((e: any) => e.node) || [];

  // Fetch collections
  const collectionsResponse = await admin.graphql(`
    query {
      collections(first: 20) {
        edges {
          node {
            id
            title
            handle
            seo {
              title
              description
            }
          }
        }
      }
    }
  `);
  const collectionsData = await collectionsResponse.json();
  const collections = collectionsData.data?.collections?.edges?.map((e: any) => e.node) || [];

  return json({
    shop,
    store,
    metaTags,
    altTextStats: { total: totalAltTexts, optimized: optimizedAltTexts },
    structuredData,
    localBusiness,
    products,
    collections,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  const store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    return json({ success: false, error: "Store not found" });
  }

  if (actionType === "generateMetaTags") {
    const resourceType = formData.get("resourceType") as string;
    const resourceId = formData.get("resourceId") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    try {
      const generated = await generateMetaTags({
        title,
        description,
        type: resourceType as "product" | "collection" | "page" | "article",
      });

      // Save to database
      await prisma.metaTag.upsert({
        where: {
          storeId_resourceType_resourceId: {
            storeId: store.id,
            resourceType,
            resourceId,
          },
        },
        create: {
          storeId: store.id,
          resourceType,
          resourceId,
          metaTitle: generated.metaTitle,
          metaDescription: generated.metaDescription,
          originalTitle: title,
          originalDescription: description,
          isOptimized: true,
          seoScore: 85,
        },
        update: {
          metaTitle: generated.metaTitle,
          metaDescription: generated.metaDescription,
          isOptimized: true,
        },
      });

      return json({ success: true, generated });
    } catch (error: any) {
      return json({ success: false, error: error.message });
    }
  }

  if (actionType === "saveMetaTags") {
    const resourceType = formData.get("resourceType") as string;
    const resourceId = formData.get("resourceId") as string;
    const metaTitle = formData.get("metaTitle") as string;
    const metaDescription = formData.get("metaDescription") as string;

    // Update in Shopify
    if (resourceType === "product") {
      await admin.graphql(`
        mutation updateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: resourceId,
            seo: {
              title: metaTitle,
              description: metaDescription,
            },
          },
        },
      });
    } else if (resourceType === "collection") {
      await admin.graphql(`
        mutation updateCollection($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: resourceId,
            seo: {
              title: metaTitle,
              description: metaDescription,
            },
          },
        },
      });
    }

    // Save to database
    await prisma.metaTag.upsert({
      where: {
        storeId_resourceType_resourceId: {
          storeId: store.id,
          resourceType,
          resourceId,
        },
      },
      create: {
        storeId: store.id,
        resourceType,
        resourceId,
        metaTitle,
        metaDescription,
        isOptimized: true,
        seoScore: 85,
      },
      update: {
        metaTitle,
        metaDescription,
        isOptimized: true,
      },
    });

    return json({ success: true });
  }

  if (actionType === "autoGenerateAltText") {
    const applyToProducts = formData.get("applyToProducts") === "true";
    const applyToCollections = formData.get("applyToCollections") === "true";
    const onlyMissing = formData.get("onlyMissing") === "true";

    // Fetch images that need alt text
    if (applyToProducts) {
      const productsResponse = await admin.graphql(`
        query {
          products(first: 50) {
            edges {
              node {
                id
                title
                images(first: 10) {
                  edges {
                    node {
                      id
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
      const products = productsData.data?.products?.edges || [];

      for (const product of products) {
        for (const image of product.node.images?.edges || []) {
          if (onlyMissing && image.node.altText) continue;

          // Generate alt text using AI
          const altText = await generateAltText({
            imageUrl: image.node.url,
            productTitle: product.node.title,
          });

          // Update in Shopify (would need to use REST API for images)
          // Save to database
          await prisma.altTextOptimization.upsert({
            where: {
              storeId_imageId: {
                storeId: store.id,
                imageId: image.node.id,
              },
            },
            create: {
              storeId: store.id,
              imageId: image.node.id,
              resourceType: "product",
              resourceId: product.node.id,
              originalAltText: image.node.altText,
              optimizedAltText: altText,
              isOptimized: true,
            },
            update: {
              optimizedAltText: altText,
              isOptimized: true,
            },
          });
        }
      }
    }

    return json({ success: true });
  }

  if (actionType === "toggleStructuredData") {
    const type = formData.get("type") as string;
    const enabled = formData.get("enabled") === "true";

    const existing = await prisma.structuredData.findFirst({
      where: { storeId: store.id, type },
    });

    if (existing) {
      await prisma.structuredData.update({
        where: { id: existing.id },
        data: { isEnabled: enabled },
      });
    } else {
      // Generate default structured data based on type
      let jsonLd: any = {};

      if (type === "Organization") {
        jsonLd = generateOrganizationStructuredData({
          name: shop.split(".")[0],
          url: `https://${shop}`,
        });
      } else if (type === "Breadcrumb") {
        jsonLd = generateBreadcrumbStructuredData([
          { name: "Home", url: `https://${shop}` },
        ]);
      }

      await prisma.structuredData.create({
        data: {
          storeId: store.id,
          type,
          jsonLd,
          isEnabled: enabled,
        },
      });
    }

    return json({ success: true });
  }

  if (actionType === "saveLocalBusiness") {
    const businessName = formData.get("businessName") as string;
    const businessType = formData.get("businessType") as string;
    const telephone = formData.get("telephone") as string;
    const priceRange = formData.get("priceRange") as string;
    const streetAddress = formData.get("streetAddress") as string;
    const addressLocality = formData.get("addressLocality") as string;
    const addressRegion = formData.get("addressRegion") as string;
    const postalCode = formData.get("postalCode") as string;
    const addressCountry = formData.get("addressCountry") as string;

    await prisma.localBusiness.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        businessName,
        businessType,
        telephone,
        priceRange,
        streetAddress,
        addressLocality,
        addressRegion,
        postalCode,
        addressCountry,
      },
      update: {
        businessName,
        businessType,
        telephone,
        priceRange,
        streetAddress,
        addressLocality,
        addressRegion,
        postalCode,
        addressCountry,
      },
    });

    return json({ success: true });
  }

  return json({ success: false });
};

export default function SearchAppearance() {
  const {
    shop,
    store,
    metaTags,
    altTextStats,
    structuredData,
    localBusiness,
    products,
    collections,
  } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const [selectedTab, setSelectedTab] = useState(0);
  const [editingMeta, setEditingMeta] = useState<any>(null);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [showMetaModal, setShowMetaModal] = useState(false);

  // Alt text settings
  const [autoAltEnabled, setAutoAltEnabled] = useState(false);
  const [applyToProducts, setApplyToProducts] = useState(true);
  const [applyToCollections, setApplyToCollections] = useState(false);
  const [onlyMissingAlt, setOnlyMissingAlt] = useState(true);

  // Structured data toggles
  const [breadcrumbEnabled, setBreadcrumbEnabled] = useState(
    structuredData.find((s) => s.type === "Breadcrumb")?.isEnabled || false
  );
  const [siteSearchEnabled, setSiteSearchEnabled] = useState(
    structuredData.find((s) => s.type === "SiteSearch")?.isEnabled || false
  );
  const [productEnabled, setProductEnabled] = useState(
    structuredData.find((s) => s.type === "Product")?.isEnabled || false
  );
  const [articleEnabled, setArticleEnabled] = useState(
    structuredData.find((s) => s.type === "Article")?.isEnabled || false
  );
  const [collectionEnabled, setCollectionEnabled] = useState(
    structuredData.find((s) => s.type === "Collection")?.isEnabled || false
  );
  const [organizationEnabled, setOrganizationEnabled] = useState(
    structuredData.find((s) => s.type === "Organization")?.isEnabled || false
  );

  // Local business form
  const [businessName, setBusinessName] = useState(localBusiness?.businessName || shop.split(".")[0]);
  const [businessType, setBusinessType] = useState(localBusiness?.businessType || "LocalBusiness");
  const [telephone, setTelephone] = useState(localBusiness?.telephone || "");
  const [priceRange, setPriceRange] = useState(localBusiness?.priceRange || "");

  const isLoading = navigation.state === "submitting";

  const handleEditMeta = (item: any, type: string) => {
    setEditingMeta({ ...item, resourceType: type });
    setMetaTitle(item.seo?.title || item.title || "");
    setMetaDescription(item.seo?.description || "");
    setShowMetaModal(true);
  };

  const handleGenerateMetaTags = () => {
    if (!editingMeta) return;

    submit(
      {
        action: "generateMetaTags",
        resourceType: editingMeta.resourceType,
        resourceId: editingMeta.id,
        title: editingMeta.title,
        description: editingMeta.description || "",
      },
      { method: "post" }
    );
  };

  const handleSaveMetaTags = () => {
    if (!editingMeta) return;

    submit(
      {
        action: "saveMetaTags",
        resourceType: editingMeta.resourceType,
        resourceId: editingMeta.id,
        metaTitle,
        metaDescription,
      },
      { method: "post" }
    );
    setShowMetaModal(false);
  };

  const handleAutoAltText = () => {
    submit(
      {
        action: "autoGenerateAltText",
        applyToProducts: applyToProducts.toString(),
        applyToCollections: applyToCollections.toString(),
        onlyMissing: onlyMissingAlt.toString(),
      },
      { method: "post" }
    );
  };

  const handleToggleStructuredData = (type: string, enabled: boolean) => {
    submit(
      {
        action: "toggleStructuredData",
        type,
        enabled: enabled.toString(),
      },
      { method: "post" }
    );
  };

  const handleSaveLocalBusiness = () => {
    submit(
      {
        action: "saveLocalBusiness",
        businessName,
        businessType,
        telephone,
        priceRange,
      },
      { method: "post" }
    );
  };

  const tabs = [
    { id: "alt-text", content: "Image Alt Text", panelID: "alt-text-panel" },
    { id: "meta-tags", content: "Bulk-edit Meta Tags", panelID: "meta-tags-panel" },
    { id: "structured-data", content: "Google Structured Data", panelID: "structured-data-panel" },
    { id: "local-business", content: "Local Business", panelID: "local-business-panel" },
    { id: "instant-index", content: "Instant Index", panelID: "instant-index-panel" },
    { id: "analytics", content: "Google Analytics", panelID: "analytics-panel" },
  ];

  const businessTypes = [
    { label: "Local Business", value: "LocalBusiness" },
    { label: "Restaurant", value: "Restaurant" },
    { label: "Store", value: "Store" },
    { label: "Professional Service", value: "ProfessionalService" },
    { label: "Health & Beauty", value: "HealthAndBeautyBusiness" },
    { label: "Automotive Business", value: "AutomotiveBusiness" },
  ];

  return (
    <Page
      title="Search Appearance"
      subtitle="Control how your store appears in search results"
    >
      <Layout>
        <Layout.Section>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            {/* Image Alt Text Tab */}
            {selectedTab === 0 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">
                            Alt Text Statistics
                          </Text>
                        </BlockStack>
                        <InlineStack gap="400">
                          <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                            <BlockStack align="center">
                              <Text as="span" variant="headingMd">{altTextStats.total}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">Total</Text>
                            </BlockStack>
                          </Box>
                          <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                            <BlockStack align="center">
                              <Text as="span" variant="headingMd">{altTextStats.total - altTextStats.optimized}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">Missing</Text>
                            </BlockStack>
                          </Box>
                        </InlineStack>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text as="h2" variant="headingMd">
                          Auto Add Image Alt Text
                        </Text>
                        <Badge>{autoAltEnabled ? "On" : "Off"}</Badge>
                      </InlineStack>

                      <Text as="p" variant="bodySm" tone="subdued">
                        When enabled, SEO Booster automatically generates image alt text based on predefined rules.
                      </Text>

                      <BlockStack gap="300">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          Application Range
                        </Text>
                        <Checkbox
                          label="All product image alt"
                          checked={applyToProducts}
                          onChange={setApplyToProducts}
                        />
                        <Checkbox
                          label="Collection image alt"
                          checked={applyToCollections}
                          onChange={setApplyToCollections}
                        />
                        <Checkbox
                          label="Only for images without Alt text"
                          helpText="If checked, alt attributes will only be generated for images that do not have alt attributes."
                          checked={onlyMissingAlt}
                          onChange={setOnlyMissingAlt}
                        />
                      </BlockStack>

                      <Button variant="primary" onClick={handleAutoAltText} loading={isLoading}>
                        Generate Alt Text
                      </Button>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Bulk-edit Meta Tags Tab */}
            {selectedTab === 1 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Products Meta Tags
                      </Text>

                      <DataTable
                        columnContentTypes={["text", "text", "text", "text"]}
                        headings={["Product", "Meta Title", "Meta Description", "Actions"]}
                        rows={products.map((product: any) => [
                          <Text as="span" variant="bodyMd" truncate>
                            {product.title}
                          </Text>,
                          <Text as="span" variant="bodySm" tone={product.seo?.title ? "success" : "subdued"}>
                            {product.seo?.title || "Not set"}
                          </Text>,
                          <Box maxWidth="200px">
                            <Text as="span" variant="bodySm" tone={product.seo?.description ? "success" : "subdued"} truncate>
                              {product.seo?.description || "Not set"}
                            </Text>
                          </Box>,
                          <Button size="slim" onClick={() => handleEditMeta(product, "product")}>
                            Edit
                          </Button>,
                        ])}
                      />
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Collections Meta Tags
                      </Text>

                      <DataTable
                        columnContentTypes={["text", "text", "text", "text"]}
                        headings={["Collection", "Meta Title", "Meta Description", "Actions"]}
                        rows={collections.map((collection: any) => [
                          <Text as="span" variant="bodyMd" truncate>
                            {collection.title}
                          </Text>,
                          <Text as="span" variant="bodySm" tone={collection.seo?.title ? "success" : "subdued"}>
                            {collection.seo?.title || "Not set"}
                          </Text>,
                          <Box maxWidth="200px">
                            <Text as="span" variant="bodySm" tone={collection.seo?.description ? "success" : "subdued"} truncate>
                              {collection.seo?.description || "Not set"}
                            </Text>
                          </Box>,
                          <Button size="slim" onClick={() => handleEditMeta(collection, "collection")}>
                            Edit
                          </Button>,
                        ])}
                      />
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Google Structured Data Tab */}
            {selectedTab === 2 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">Breadcrumb</Text>
                          <Badge>{breadcrumbEnabled ? "On" : "Off"}</Badge>
                        </BlockStack>
                        <Checkbox
                          label=""
                          checked={breadcrumbEnabled}
                          onChange={(checked) => {
                            setBreadcrumbEnabled(checked);
                            handleToggleStructuredData("Breadcrumb", checked);
                          }}
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        By using JSON-LD Breadcrumb to provide search engines with a clear and concise
                        representation of your website's structure, which can improve visibility in search results.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">Site Search Box</Text>
                          <Badge>{siteSearchEnabled ? "On" : "Off"}</Badge>
                        </BlockStack>
                        <Checkbox
                          label=""
                          checked={siteSearchEnabled}
                          onChange={(checked) => {
                            setSiteSearchEnabled(checked);
                            handleToggleStructuredData("SiteSearch", checked);
                          }}
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        By using JSON-LD Site Search Box to improve the visibility of your site's search results
                        in SERPs and make it easier for users to find content.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">Product</Text>
                          <Badge>{productEnabled ? "On" : "Off"}</Badge>
                        </BlockStack>
                        <Checkbox
                          label=""
                          checked={productEnabled}
                          onChange={(checked) => {
                            setProductEnabled(checked);
                            handleToggleStructuredData("Product", checked);
                          }}
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        By adding rating stars, vote numbers, pricing, stock information, and other relevant details
                        to enhance the shopping experience and improve search engine visibility.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">Article</Text>
                          <Badge>{articleEnabled ? "On" : "Off"}</Badge>
                        </BlockStack>
                        <Checkbox
                          label=""
                          checked={articleEnabled}
                          onChange={(checked) => {
                            setArticleEnabled(checked);
                            handleToggleStructuredData("Article", checked);
                          }}
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        By using JSON-LD markup on your article pages, you can provide search engines with
                        more detailed information about your content.
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="h2" variant="headingMd">Organization</Text>
                          <Badge>{organizationEnabled ? "On" : "Off"}</Badge>
                        </BlockStack>
                        <Checkbox
                          label=""
                          checked={organizationEnabled}
                          onChange={(checked) => {
                            setOrganizationEnabled(checked);
                            handleToggleStructuredData("Organization", checked);
                          }}
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        The type of store that will show organization information in Google search results
                        after setting up JSON-LD for organization.
                      </Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Local Business Tab */}
            {selectedTab === 3 && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingMd">Local Business</Text>
                      <Badge>Off</Badge>
                    </InlineStack>

                    <Text as="p" variant="bodySm" tone="subdued">
                      The local pack shows businesses like restaurants, hotels, shops, and service providers
                      based on the user's search and location. However, not all local businesses appear,
                      as Google uses various factors to determine visibility.
                    </Text>

                    <FormLayout>
                      <TextField
                        label="Business Name"
                        value={businessName}
                        onChange={setBusinessName}
                        autoComplete="off"
                      />

                      <Select
                        label="Business Type"
                        options={businessTypes}
                        value={businessType}
                        onChange={setBusinessType}
                      />

                      <TextField
                        label="Telephone"
                        value={telephone}
                        onChange={setTelephone}
                        type="tel"
                        autoComplete="tel"
                      />

                      <TextField
                        label="Price Range"
                        value={priceRange}
                        onChange={setPriceRange}
                        placeholder="$$ or $$$ or $$$$"
                        autoComplete="off"
                      />
                    </FormLayout>

                    <Button variant="primary" onClick={handleSaveLocalBusiness} loading={isLoading}>
                      Save
                    </Button>
                  </BlockStack>
                </Card>
              </Box>
            )}

            {/* Instant Index Tab */}
            {selectedTab === 4 && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Instant Index</Text>

                    <Banner tone="info">
                      <p>
                        Connect your Google Search Console to enable instant indexing.
                        This allows you to notify Google immediately when you publish or update content.
                      </p>
                    </Banner>

                    <Button variant="primary">Connect Google Search Console</Button>
                  </BlockStack>
                </Card>
              </Box>
            )}

            {/* Google Analytics Tab */}
            {selectedTab === 5 && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Google Analytics</Text>

                    <Banner tone="info">
                      <p>
                        Connect your Google Analytics account to track your store's performance
                        and understand how visitors interact with your content.
                      </p>
                    </Banner>

                    <Button variant="primary">Connect Google Analytics</Button>
                  </BlockStack>
                </Card>
              </Box>
            )}
          </Tabs>
        </Layout.Section>
      </Layout>

      {/* Edit Meta Tags Modal */}
      <Modal
        open={showMetaModal}
        onClose={() => setShowMetaModal(false)}
        title={`Edit Meta Tags - ${editingMeta?.title || ""}`}
        primaryAction={{
          content: "Save",
          onAction: handleSaveMetaTags,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "Generate with AI",
            onAction: handleGenerateMetaTags,
            loading: isLoading,
          },
          {
            content: "Cancel",
            onAction: () => setShowMetaModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Meta Title"
              value={metaTitle}
              onChange={setMetaTitle}
              maxLength={60}
              showCharacterCount
              helpText="Recommended: 50-60 characters"
              autoComplete="off"
            />

            <TextField
              label="Meta Description"
              value={metaDescription}
              onChange={setMetaDescription}
              maxLength={160}
              showCharacterCount
              multiline={3}
              helpText="Recommended: 150-160 characters"
              autoComplete="off"
            />

            <Card>
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  Google Preview
                </Text>
                <Box background="bg-surface-secondary" padding="300" borderRadius="100">
                  <BlockStack gap="100">
                    <Text as="span" variant="bodyMd" fontWeight="semibold" tone="info">
                      {metaTitle || editingMeta?.title || "Page Title"}
                    </Text>
                    <Text as="span" variant="bodySm" tone="success">
                      {shop}/{editingMeta?.handle || "page-url"}
                    </Text>
                    <Text as="span" variant="bodySm">
                      {metaDescription || "Meta description will appear here..."}
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
