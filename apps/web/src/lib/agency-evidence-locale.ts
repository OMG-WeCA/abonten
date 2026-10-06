/** Display translations for application-owned evidence explanations only.
 * Canonical facts, document text and arbitrary source content remain unchanged.
 * Exact matches deliberately avoid guessing whether other prose needs translation. */
import { displayUiText } from './display-ui-text';

const frenchText = new Map<string, string>([
  [
    'Synthetic agency demonstration sample; dimensions, location and NGN prices are illustrative. No verified media, commercial booking, permit or audience claim.',
    'Exemple fictif pour l’agence ; dimensions, emplacement et prix en NGN sont illustratifs. Aucun média vérifié, réservation commerciale, permis ou audience attestée.',
  ],
  [
    'DEMO: synthetic location, not a verified physical board. Geographic and audience enrichment is unavailable for this sample.',
    'DEMO : emplacement fictif, aucun panneau physique vérifié. Les données géographiques et d’audience sont indisponibles pour cet exemple.',
  ],
  [
    'DEMO boards, dimensions, prices and availability are synthetic planning samples, not verified physical inventory or commercially bookable supply. No audience/enrichment is inferred from synthetic pins.',
    'Les panneaux DEMO, dimensions, prix et disponibilités sont des exemples fictifs de planification, sans inventaire physique vérifié ni réservation commerciale. Aucune donnée d’audience ou donnée enrichie n’est déduite des repères fictifs.',
  ],

  [
    'Draft restored. Board details are checked again; documents and chat are not saved.',
    'Brouillon restauré. Les données des panneaux sont revérifiées ; les documents et la conversation ne sont pas enregistrés.',
  ],
  [
    'Choose valid start and exclusive end dates.',
    'Choisissez des dates de début et de fin exclusive valides.',
  ],
  ['This face is not bookable.', 'Cette face ne peut pas être réservée.'],
  [
    'The recorded permit does not cover this flight.',
    'Le permis enregistré ne couvre pas cette période de diffusion.',
  ],
  [
    'Digital screen and loop specifications are incomplete.',
    'Les caractéristiques de l’écran numérique et de sa boucle sont incomplètes.',
  ],
  [
    'This face is unavailable for the selected flight.',
    'Cette face est indisponible pour la période sélectionnée.',
  ],
  ['Choose a supported currency.', 'Choisissez une devise prise en charge.'],
  [
    'Face-specific rate dates are invalid; request a partner quote.',
    'Les dates du tarif propre à cette face sont invalides ; demandez un devis au partenaire.',
  ],
  ['Choose a currency for this face.', 'Choisissez une devise pour cette face.'],
  [
    'No published rate covers this flight.',
    'Aucun tarif publié ne couvre cette période de diffusion.',
  ],
  [
    'The published currency is unsupported.',
    'La devise du tarif publié n’est pas prise en charge.',
  ],
  [
    'No published rate covers the start of this flight.',
    'Aucun tarif publié ne couvre le début de cette période de diffusion.',
  ],
  [
    'This flight spans a rate change; request a partner quote.',
    'Le tarif change pendant cette période de diffusion ; demandez un devis au partenaire.',
  ],
  [
    'The recorded minimum booking duration is invalid.',
    'La durée minimale de réservation enregistrée est invalide.',
  ],
  [
    'Seasonal pricing requires a partner quote.',
    'La tarification saisonnière nécessite un devis du partenaire.',
  ],
  ['The published rate is invalid.', 'Le tarif publié est invalide.'],
  [
    'Monthly billing and proration policy is not recorded; request a partner quote.',
    'Les règles de facturation mensuelle et de prorata ne sont pas renseignées ; demandez un devis au partenaire.',
  ],
  [
    'Weekly-only pricing requires a whole number of 7-day weeks.',
    'La tarification à la semaine exige un nombre entier de semaines de 7 jours.',
  ],
  ['No usable published price is recorded.', 'Aucun prix publié exploitable n’est renseigné.'],
  [
    'The calculated media cost is outside the supported range.',
    'Le coût média calculé dépasse les limites prises en charge.',
  ],
  [
    'Daily rate × flight days; no monthly or weekly discount assumed.',
    'Tarif journalier × jours de diffusion ; aucune remise mensuelle ou hebdomadaire n’est supposée.',
  ],
  [
    'Weekly rate × complete 7-day weeks; no proration assumed.',
    'Tarif hebdomadaire × semaines complètes de 7 jours ; aucun prorata n’est supposé.',
  ],
  [
    'Media only; tax, production, installation and negotiated discounts are not recorded.',
    'Média uniquement ; les taxes, la production, l’installation et les remises négociées ne sont pas renseignées.',
  ],
  [
    'Face availability has not been checked for this flight.',
    'La disponibilité de cette face n’a pas été vérifiée pour cette période de diffusion.',
  ],
  [
    'Availability is indicative; no reservation is created.',
    'La disponibilité est indicative ; aucune réservation n’est créée.',
  ],
  ['Published media estimates only.', 'Estimations des tarifs média publiés uniquement.'],
  [
    'Currencies are not converted without an approved FX snapshot.',
    'Aucune devise n’est convertie sans une référence de change approuvée.',
  ],
  [
    'Availability checks do not reserve inventory.',
    'Les contrôles de disponibilité ne réservent pas l’inventaire.',
  ],
  [
    'Haversine great-circle distance; mean Earth radius 6,371.0088 km.',
    'Distance orthodromique selon Haversine ; rayon terrestre moyen de 6 371,0088 km.',
  ],
  ['Registered site coordinates (WGS84).', 'Coordonnées enregistrées du site (WGS84).'],
  [
    'Straight-line distance; road routes and travel time are not calculated.',
    'Distance à vol d’oiseau ; les itinéraires routiers et les temps de trajet ne sont pas calculés.',
  ],
  [
    'Observed traffic counts have no validated audience conversion and visibility model for this flight.',
    'Les comptages de trafic observés ne disposent pas d’un modèle validé de conversion en audience et de visibilité pour cette période de diffusion.',
  ],
  [
    'Production traffic metadata has no validated audience conversion and visibility model.',
    'Les métadonnées de trafic de production ne disposent pas d’un modèle validé de conversion en audience et de visibilité.',
  ],
  [
    'Validated, current production traffic and an approved OTS model are unavailable.',
    'Des données de trafic de production actuelles et validées ainsi qu’un modèle approuvé d’opportunités de voir sont indisponibles.',
  ],
  [
    'Residential population is context; it is not added to traffic or impressions.',
    'La population résidentielle est un contexte ; elle n’est pas ajoutée au trafic ni aux impressions.',
  ],
  [
    'Traffic observations are not extrapolated into AADT or campaign exposure.',
    'Les observations de trafic ne sont pas extrapolées en trafic moyen journalier annuel (TMJA) ni en exposition de campagne.',
  ],
  [
    'Gross impressions count repeat opportunities. Deduplicated reach requires a separate audience model.',
    'Les impressions brutes comptent les occasions répétées d’exposition. La couverture dédupliquée nécessite un modèle d’audience distinct.',
  ],
  [
    'Demo, stale, unverified and incomplete-provenance metadata are excluded from model inputs.',
    'Les métadonnées de démonstration, périmées, non vérifiées ou de provenance incomplète sont exclues des entrées du modèle.',
  ],
  [
    'A plan OTS total requires validated flight estimates for every selected face; deduplicated reach is unavailable.',
    'Le total des opportunités de voir du plan exige des estimations de diffusion validées pour chaque face sélectionnée ; la couverture dédupliquée est indisponible.',
  ],
  ['This listed face is no longer available.', 'Cette face publiée n’est plus disponible.'],
  ['Face no longer available.', 'Face indisponible.'],
  ['Face added to your draft shortlist.', 'Face ajoutée à votre sélection.'],
  [
    'Boards could not be checked. Your draft shortlist is preserved; retry when the connection recovers.',
    'Les panneaux n’ont pas pu être vérifiés. Votre sélection est conservée ; réessayez après reconnexion.',
  ],
  ['Could not switch workspace. Try again.', 'Impossible de changer d’espace. Réessayez.'],
  [
    'The budget currency is unclear. Set the media budget and currency manually before finding boards.',
    'La devise du budget est incertaine. Définissez manuellement le budget média et la devise avant de rechercher des panneaux.',
  ],
  [
    'The planner timed out. Your message is preserved; retry when ready.',
    'L’assistant a dépassé le délai. Votre message est conservé ; réessayez.',
  ],
  [
    'Planner unavailable. Your message is preserved.',
    'Assistant indisponible. Votre message est conservé.',
  ],
  ['Brief could not be read. Try again.', 'Le document n’a pas pu être lu. Réessayez.'],
  [
    'Camera capture needs a secure connection and a supported browser. You can upload a photo instead.',
    'La prise de photo nécessite une connexion sécurisée et un navigateur compatible. Vous pouvez importer une photo.',
  ],
  [
    'Camera access was unavailable. Check permission or upload a photo.',
    'Accès à la caméra indisponible. Vérifiez les autorisations ou importez une photo.',
  ],
  [
    'The photo could not be saved. Try capturing again or upload a photo.',
    'La photo n’a pas pu être enregistrée. Réessayez ou importez une photo.',
  ],
  ['Choose MP4 or WebM up to 50 MB.', 'Choisissez un MP4 ou WebM de 50 Mo maximum.'],
  ['Choose JPEG, PNG or WebP up to 10 MB.', 'Choisissez un JPEG, PNG ou WebP de 10 Mo maximum.'],
  ['Draft shortlist cleared.', 'Sélection effacée.'],
  [
    'This draft holds up to 100 faces. Remove a face before adding another.',
    'Ce brouillon contient au maximum 100 faces. Retirez une face avant d’en ajouter une.',
  ],
  [
    'No checked faces fit this budget, currency and flight. Adjust the constraints.',
    'Aucune face vérifiée ne correspond au budget, à la devise et aux dates. Ajustez les contraintes.',
  ],
  [
    'This tab’s draft restored. Board facts are checked again; brief and conversation start fresh.',
    'Brouillon de cet onglet restauré. Les données sont revérifiées ; document et conversation sont réinitialisés.',
  ],
  [
    'Fresh board facts have not been loaded for this draft face.',
    'Les données actuelles du panneau n’ont pas été chargées pour cette face du brouillon.',
  ],
  [
    'Confirm flight dates before estimating media cost.',
    'Confirmez les dates de diffusion avant d’estimer le coût média.',
  ],
  [
    'This subtotal covers the included faces only; some draft selections were omitted from this bounded request. Full-plan budget fit is unknown.',
    'Ce sous-total couvre uniquement les faces incluses ; certaines sélections du brouillon ont été omises de cette requête limitée. L’adéquation au budget du plan complet est inconnue.',
  ],
  [
    'Canonical same-currency flight affordability first; stable marketplace order within each group. Not an audience or optimal portfolio ranking.',
    'Priorité à l’adéquation tarifaire de la diffusion dans une même devise ; ordre stable de la place de marché dans chaque groupe. Ce classement ne mesure ni l’audience ni l’optimisation du portefeuille.',
  ],
  [
    'Marketplace-ready public inventory only; brief-aware search reads at most three eight-board pages and includes twelve discovered candidates plus selected boards. Coverage is bounded, not exhaustive.',
    'Inventaire public prêt pour la place de marché uniquement ; la recherche selon le brief lit au plus trois pages de huit panneaux et inclut douze candidats trouvés ainsi que les panneaux sélectionnés. La couverture est limitée et non exhaustive.',
  ],
  [
    'Literal inferred requirements require confirmation. Confirmed controls override them. Candidate budgetMatch is individual-face media affordability, not full-plan fit.',
    'Les besoins déduits du texte doivent être confirmés. Les réglages confirmés ont priorité. Le champ budgetMatch d’un candidat mesure l’adéquation tarifaire d’une face, pas celle du plan complet.',
  ],
  [
    'Production metadata is projected for included sites; at most six authorized geographic contexts are read. Read-budget or processing failures mean unknown context, never zero or no real-world features.',
    'Les métadonnées de production sont présentées pour les sites inclus ; au plus six contextes géographiques autorisés sont lus. Une limite de lecture ou un échec de traitement signifie un contexte inconnu, jamais une valeur nulle ni une absence de lieux réels.',
  ],
  [
    'Production enrichment is descriptive, with exact units, periods, provenance and freshness. Stale, future, unverified or unknown-freshness inputs cannot establish current audience performance.',
    'Les données enrichies de production sont descriptives et conservent leurs unités, périodes, provenance et actualité. Des données périmées, futures, non vérifiées ou d’actualité inconnue ne prouvent pas les performances actuelles d’audience.',
  ],
  [
    'UTC start inclusive, end exclusive. Published media estimates exclude tax, production and FX conversion.',
    'Début inclus et fin exclusive en UTC. Les estimations média publiées excluent les taxes, la production et la conversion de devises.',
  ],
  [
    'Availability is indicative; this request never reserves or books inventory.',
    'La disponibilité est indicative ; cette requête ne réserve jamais l’inventaire.',
  ],
  [
    'Distances are straight-line kilometres from registered WGS84 coordinates. Elevation is metres; orientation is degrees. Width/height use each site’s recorded units; null units are unknown.',
    'Les distances sont des kilomètres à vol d’oiseau depuis les coordonnées WGS84 enregistrées. La hauteur est en mètres et l’orientation en degrés. La largeur et la hauteur utilisent les unités enregistrées de chaque site ; une unité absente reste inconnue.',
  ],
  [
    'Validated OTS and deduplicated reach models are unavailable; population and traffic are not summed.',
    'Les modèles validés d’opportunités de voir et de couverture dédupliquée sont indisponibles ; la population et le trafic ne sont pas additionnés.',
  ],
  [
    'No source-backed metadata is available.',
    'Aucune métadonnée étayée par une source n’est disponible.',
  ],
  ['Metadata has no valid value.', 'Les métadonnées ne contiennent aucune valeur valide.'],
  [
    'Synthetic/demo metadata is excluded from production context.',
    'Les métadonnées synthétiques ou de démonstration sont exclues du contexte de production.',
  ],
  [
    'Production data classification is missing.',
    'La classification des données de production est absente.',
  ],
  [
    'Source, method or collection date is missing.',
    'La source, la méthode ou la date de collecte est absente.',
  ],
  ['Metadata is unverified.', 'Les métadonnées ne sont pas vérifiées.'],
  [
    'Metadata is expired or has a future collection date.',
    'Les métadonnées sont périmées ou leur date de collecte est future.',
  ],
  [
    'No expiry/update policy is available; current validity is unknown.',
    'Aucune règle d’expiration ou de mise à jour n’est disponible ; la validité actuelle est inconnue.',
  ],
  [
    'Partner declaration; independent verification is unavailable.',
    'Déclaration du partenaire ; aucune vérification indépendante n’est disponible.',
  ],
  [
    'Production geographic context is unavailable.',
    'Le contexte géographique de production est indisponible.',
  ],
  [
    'Geographic source provenance is missing, synthetic or invalid.',
    'La provenance de la source géographique est absente, synthétique ou invalide.',
  ],
  [
    'Source vintage is retained; no expiry/update policy establishes present-day validity.',
    'La date de référence de la source est conservée ; aucune règle d’expiration ou de mise à jour ne prouve sa validité actuelle.',
  ],
  [
    'Metric has invalid or missing measurements.',
    'La mesure contient des valeurs invalides ou absentes.',
  ],
  [
    'Synthetic inventory is not production enrichment.',
    'L’inventaire synthétique ne constitue pas un enrichissement de production.',
  ],
  [
    'Inventory measurement is missing or invalid.',
    'La mesure de l’inventaire est absente ou invalide.',
  ],
  ['Measurement provenance is unavailable.', 'La provenance de la mesure est indisponible.'],
  ['Registered inventory declaration', 'Déclaration enregistrée de l’inventaire'],
  [
    'Registered value has no matching source-backed measurement record.',
    'La valeur enregistrée n’est associée à aucune mesure étayée par une source.',
  ],
  ['Illumination configuration is unavailable.', 'La configuration d’éclairage est indisponible.'],
  [
    'Configuration does not confirm measured night-time visibility.',
    'La configuration ne confirme pas une visibilité nocturne mesurée.',
  ],
  [
    'Viewing angle is not recorded in the current inventory contract; facing orientation is a separate measurement.',
    'L’angle de vue n’est pas renseigné dans le modèle actuel d’inventaire ; l’orientation est une mesure distincte.',
  ],
  [
    'Descriptive context and declared visibility have no validated flight exposure or deduplicated audience model. Population is not added to traffic.',
    'Le contexte descriptif et la visibilité déclarée ne disposent pas d’un modèle validé d’exposition de campagne ou d’audience dédupliquée. La population n’est pas ajoutée au trafic.',
  ],
  [
    'Enrichment lists and method descriptions are bounded for model input; full canonical source evidence is retained in API facts. Missing/reduced data never means zero. Numeric media costs and distances are unchanged.',
    'Les listes de données enrichies et les descriptions de méthodes sont limitées pour l’entrée du modèle ; les preuves sources complètes restent conservées dans les données de l’API. Des données absentes ou réduites ne signifient jamais zéro. Les coûts média et les distances numériques restent inchangés.',
  ],
  [
    'Enrichment omitted from this model context to respect the total transfer budget. Full source-backed evidence remains in API facts.',
    'Les données enrichies sont omises de ce contexte du modèle pour respecter la limite totale de transfert. Les preuves complètes étayées par des sources restent dans les données de l’API.',
  ],
  [
    'Text was truncated to 60,000 characters. Confirm that all planning requirements are included.',
    'Le texte a été limité à 60 000 caractères. Vérifiez que tous les besoins de planification sont inclus.',
  ],
  [
    'Only document text and stored spreadsheet values are extracted. Images, charts, formulas, macros and external links are never executed or fetched. Confirm the brief before applying it.',
    'Seuls le texte du document et les valeurs enregistrées du tableur sont extraits. Les images, graphiques, formules, macros et liens externes ne sont jamais exécutés ni récupérés. Vérifiez le brief avant de l’appliquer.',
  ],
  [
    'PDF text order can differ from its layout. Scanned images are not OCR-processed. Confirm the extracted brief.',
    'L’ordre du texte PDF peut différer de sa mise en page. Les images numérisées ne sont pas traitées par reconnaissance optique de caractères (OCR). Vérifiez le brief extrait.',
  ],
  [
    'Geographic context only. Modelled residents and mapped features are not audience, reach, impressions or measured traffic.',
    'Contexte géographique uniquement. Les résidents modélisés et les éléments cartographiés ne représentent ni une audience, ni une couverture, ni des impressions, ni un trafic mesuré.',
  ],
  [
    'No production reference import is available.',
    'Aucun import de référence de production n’est disponible.',
  ],
  ['Area-weighted local population grid', 'Grille locale de population pondérée par la surface'],
  [
    'Area-weighted sum of persons per pixel, using geodesic pixel/catchment intersection; no extrapolation across NoData or outside the raster.',
    'Somme des personnes par pixel pondérée par la surface, selon l’intersection géodésique des pixels et de la zone ; aucune extrapolation aux cellules NoData ni hors du raster.',
  ],
  [
    'Modelled residential population, not measured audience or daytime footfall.',
    'Population résidentielle modélisée, et non audience mesurée ou fréquentation diurne.',
  ],
  [
    'Incomplete valid raster coverage; reported residents cover only valid cell areas.',
    'La couverture valide du raster est incomplète ; les résidents indiqués couvrent uniquement les surfaces des cellules valides.',
  ],
  [
    'OSM mapped features within a geodesic radius; polygon distance is to its footprint, and each OSM feature is counted once.',
    'Éléments cartographiés par OSM dans un rayon géodésique ; la distance d’un polygone est mesurée jusqu’à son emprise et chaque élément OSM est compté une fois.',
  ],
  [
    'Nearest mapped road within 1000 metres, measured with PostGIS geography on the WGS84 spheroid; not traffic exposure.',
    'Route cartographiée la plus proche dans un rayon de 1000 mètres, mesurée avec PostGIS sur le sphéroïde WGS84 ; ce n’est pas une exposition au trafic.',
  ],
  [
    'Nearest source-named mapped road within 1000 metres, measured with PostGIS geography on the WGS84 spheroid; distinct from the closest mapped segment, not traffic exposure.',
    'Route cartographiée et nommée par la source la plus proche dans un rayon de 1000 mètres, mesurée avec PostGIS sur le sphéroïde WGS84 ; elle est distincte du tronçon cartographié le plus proche et ne mesure pas l’exposition au trafic.',
  ],
  [
    'Administrative polygons covering the site coordinate, including boundary matches.',
    'Polygones administratifs couvrant les coordonnées du site, y compris les correspondances aux limites.',
  ],
  [
    'Observed counting locations within 1000 metres; proximity does not establish exposure to the billboard.',
    'Lieux de comptage observé dans un rayon de 1000 mètres ; la proximité ne prouve pas l’exposition au panneau.',
  ],
  [
    'No licensed production traffic observations have been imported. Missing traffic is not zero.',
    'Aucune observation de trafic de production sous licence n’a été importée. Un trafic absent ne signifie pas zéro.',
  ],
  [
    'The imported population raster is temporarily unavailable. No estimate has been substituted.',
    'Le raster de population importé est temporairement indisponible. Aucune estimation de remplacement n’a été utilisée.',
  ],
  [
    'No road is mapped within 1000 metres in this import; mapping completeness is unknown.',
    'Aucune route n’est cartographiée dans un rayon de 1000 mètres dans cet import ; l’exhaustivité de la carte est inconnue.',
  ],
  ['OSM mapping completeness is unknown.', 'L’exhaustivité de la cartographie OSM est inconnue.'],
  [
    'The 1000 metre named-road search is outside this import coverage.',
    'La recherche de routes nommées dans un rayon de 1000 mètres est hors de la couverture de cet import.',
  ],
  [
    'The 1000 metre named-road search is only partly covered by this import; a closer named road may be missing.',
    'La recherche de routes nommées dans un rayon de 1000 mètres n’est que partiellement couverte par cet import ; une route nommée plus proche peut manquer.',
  ],
  [
    'No source-named road is mapped within 1000 metres in the covered area; this does not establish the absence of real named roads.',
    'Aucune route nommée par la source n’est cartographiée dans un rayon de 1000 mètres dans la zone couverte ; cela ne prouve pas l’absence de routes réelles nommées.',
  ],
  [
    'No containing administrative polygon in this import.',
    'Aucun polygone administratif contenant ce point dans cet import.',
  ],
  [
    'The point intersects multiple boundaries; no administrative match has been discarded.',
    'Le point intersecte plusieurs limites ; aucune correspondance administrative n’a été écartée.',
  ],
  [
    'The catchment is outside this import coverage.',
    'La zone est hors de la couverture de cet import.',
  ],
  [
    'Mapped counts are not a complete census of nearby POIs. Zero means no matching mapped features, not no real-world POIs.',
    'Les comptages cartographiés ne constituent pas un recensement complet des points d’intérêt proches. Zéro signifie qu’aucun élément cartographié ne correspond, pas qu’aucun point d’intérêt réel n’existe.',
  ],
  [
    'Only part of this catchment lies inside the import coverage.',
    'Seule une partie de cette zone se situe dans la couverture de l’import.',
  ],
  [
    'No observed counting location within 1000 metres. Traffic remains unknown.',
    'Aucun lieu de comptage observé dans un rayon de 1000 mètres. Le trafic reste inconnu.',
  ],
  [
    'Observed interval counts are not AADT and must not be scaled into reach or impressions.',
    'Les comptages sur un intervalle observé ne sont pas un TMJA et ne doivent pas être extrapolés en couverture ni en impressions.',
  ],
  [
    'Showing the nearest 50 counting locations.',
    'Affichage des 50 lieux de comptage les plus proches.',
  ],
  [
    'OpenStreetMap completeness varies; mapped features are not a traffic survey',
    'L’exhaustivité d’OpenStreetMap varie ; les éléments cartographiés ne constituent pas une étude de trafic',
  ],
  [
    'OSM geometries may be clipped to declared coverage at extract boundaries',
    'Les géométries OSM peuvent être découpées à la couverture déclarée aux limites de l’extrait',
  ],
  [
    'WorldPop R2025A is an alpha release; review provider caveats before planning use',
    'WorldPop R2025A est une version alpha ; examinez les réserves du fournisseur avant de l’utiliser pour la planification',
  ],
  [
    '2026 population is modelled/projected resident population, not observed footfall or advertising exposure',
    'La population 2026 est une population résidentielle modélisée ou projetée, pas une fréquentation observée ni une exposition publicitaire',
  ],
  [
    'Query extends beyond raster extent; uncovered area is unknown',
    'La requête dépasse l’emprise du raster ; la zone non couverte reste inconnue',
  ],
  ['No overlapping raster cells', 'Aucune cellule du raster ne recoupe la zone'],
  [
    'Device location was unavailable during camera capture.',
    'La position de l’appareil était indisponible lors de la prise de photo.',
  ],
  [
    'Photo location differs from the site pin; check the photo and location. This is not an independently verified mismatch.',
    'La position de la photo diffère du repère du site ; vérifiez la photo et l’emplacement. Cette différence n’a pas été vérifiée indépendamment.',
  ],
  [
    'Photo location differs from the current site pin; check the photo and location. This is not an independently verified mismatch.',
    'La position de la photo diffère du repère actuel du site ; vérifiez la photo et l’emplacement. Cette différence n’a pas été vérifiée indépendamment.',
  ],
  [
    'Embedded photo GPS differs from browser GPS; both sources are retained as unverified evidence.',
    'Le GPS intégré à la photo diffère du GPS du navigateur ; les deux sources sont conservées comme preuves non vérifiées.',
  ],
  ['No photo GPS was available.', 'Aucune position GPS de la photo n’était disponible.'],
  ['Capture date is unknown.', 'La date de prise de vue est inconnue.'],
  [
    'EXIF capture time has no timezone; confirm the capture date.',
    'La date EXIF n’a pas de fuseau horaire ; confirmez la date de prise de vue.',
  ],
  [
    'EXIF capture time is in the future and was not accepted.',
    'La date EXIF est dans le futur et n’a pas été retenue.',
  ],
  [
    'Embedded EXIF metadata could not be read; the photo was decoded separately.',
    'Les métadonnées EXIF intégrées n’ont pas pu être lues ; la photo a été décodée séparément.',
  ],
]);
const englishText = new Map(Array.from(frenchText, ([english, french]) => [french, english]));
// Earlier localized UI notices are recognized exactly when switching languages.
englishText.set(
  'Aucune face vérifiée ne correspond au budget, à la devise et aux dates.',
  'No checked faces fit this budget, currency and flight. Adjust the constraints.',
);

function originalCount(value: string, allowZero = false): string | null {
  const digits = value.replace(/[\u00a0\u202f ]/g, '');
  return (allowZero ? /^(?:0|[1-9]\d{0,15})$/ : /^[1-9]\d{0,15}$/).test(digits) &&
    (value === digits || new Intl.NumberFormat('fr-FR').format(BigInt(digits)) === value)
    ? digits
    : null;
}

/** Bounded, anchored application templates. Captured IDs/counts stay literal. */
export function agencyEvidenceText(value: string, locale: 'en' | 'fr'): string {
  const exact = (locale === 'fr' ? frenchText : englishText).get(value);
  if (exact !== undefined) return exact;
  const ui = displayUiText(value, locale);
  if (ui !== value) return ui;
  const briefSize = /^Choose a non-empty brief up to ([1-9]\d{0,3}) MB\.$/.exec(value);
  if (locale === 'fr' && briefSize)
    return `Choisissez un document non vide de ${briefSize[1]} Mo maximum.`;
  const frenchBriefSize = /^Choisissez un document non vide de ([1-9]\d{0,3}) Mo maximum\.$/.exec(
    value,
  );
  if (locale === 'en' && frenchBriefSize)
    return `Choose a non-empty brief up to ${frenchBriefSize[1]} MB.`;
  if (value.length > 512) return value;
  if (locale === 'en') {
    const minimum =
      /^La durée minimale de réservation est de ([1-9][\d\u00a0\u202f ]{0,23}) jours\.$/.exec(
        value,
      );
    const minimumDays = minimum && originalCount(minimum[1]);
    if (minimumDays) return `Minimum booking duration is ${minimumDays} days.`;
    const rate =
      /^Grille tarifaire publiée (de la face|par défaut du site) ([^\r\n]{1,128}) ; les dates d’application utilisent les jours calendaires UTC\.$/.exec(
        value,
      );
    if (rate)
      return `Published ${rate[1] === 'de la face' ? 'face' : 'site-default'} rate card ${rate[2]}; effective dates use UTC calendar days.`;
    const recovery =
      /^([\d\u00a0\u202f ]{1,24}) faces restent à vérifier ; ([\d\u00a0\u202f ]{1,24}) faces supprimées ou inaccessibles retirées\. Document et conversation réinitialisés\.$/.exec(
        value,
      );
    if (recovery) {
      const failed = originalCount(recovery[1], true);
      const removed = originalCount(recovery[2], true);
      if (failed !== null && removed !== null)
        return `${failed} draft faces still need loading; ${removed} deleted or inaccessible faces removed. Brief and conversation start fresh.`;
    }
    const recommendation =
      /^([\d\u00a0\u202f ]{1,24}) panneaux sélectionnés par coût média croissant\.(?: ([\d\u00a0\u202f ]{1,24}) panneaux n’ont pas pu être vérifiés\.)?$/.exec(
        value,
      );
    if (recommendation) {
      const selected = originalCount(recommendation[1]);
      const failed = recommendation[2] ? originalCount(recommendation[2]) : '0';
      if (selected !== null && failed !== null)
        return `Shortlisted ${selected} boards by lowest published media cost. ${failed !== '0' ? `${failed} boards could not be checked.` : ''}`;
    }
    const noData =
      /^([1-9][\d\u00a0\u202f ]{0,23}) cellules natives du raster contiennent NoData et sont exclues, sans être comptées comme zéro$/.exec(
        value,
      );
    const cells = noData && originalCount(noData[1]);
    return cells
      ? `${cells} native raster cells contain NoData and are excluded, not counted as zero`
      : value;
  }
  const minimum = /^Minimum booking duration is ([1-9]\d{0,15}) days\.$/.exec(value);
  if (minimum)
    return `La durée minimale de réservation est de ${new Intl.NumberFormat('fr-FR').format(BigInt(minimum[1]))} jours.`;
  const rate =
    /^Published (face|site-default) rate card ([^\r\n]{1,128}); effective dates use UTC calendar days\.$/.exec(
      value,
    );
  if (rate)
    return `Grille tarifaire publiée ${rate[1] === 'face' ? 'de la face' : 'par défaut du site'} ${rate[2]} ; les dates d’application utilisent les jours calendaires UTC.`;
  const recovery =
    /^(0|[1-9]\d{0,15}) draft faces still need loading; (0|[1-9]\d{0,15}) deleted or inaccessible faces removed\. Brief and conversation start fresh\.$/.exec(
      value,
    );
  const count = (number: string) => new Intl.NumberFormat('fr-FR').format(BigInt(number));
  if (recovery)
    return `${count(recovery[1])} faces restent à vérifier ; ${count(recovery[2])} faces supprimées ou inaccessibles retirées. Document et conversation réinitialisés.`;
  const recommendation =
    /^Shortlisted ([1-9]\d{0,15}) boards by lowest published media cost\. (?:(0|[1-9]\d{0,15}) boards could not be checked\.)?$/.exec(
      value,
    );
  if (recommendation)
    return `${count(recommendation[1])} panneaux sélectionnés par coût média croissant.${recommendation[2] ? ` ${count(recommendation[2])} panneaux n’ont pas pu être vérifiés.` : ''}`;
  const noData =
    /^([1-9]\d{0,15}) native raster cells contain NoData and are excluded, not counted as zero$/.exec(
      value,
    );
  if (noData)
    return `${new Intl.NumberFormat('fr-FR').format(BigInt(noData[1]))} cellules natives du raster contiennent NoData et sont exclues, sans être comptées comme zéro`;
  return value;
}

const frenchLabels = new Map<string, string>([
  ['m', 'm'],
  ['km', 'km'],
  ['ft', 'pi'],
  ['degrees', 'degrés'],
  ['people', 'personnes'],
  ['vehicles', 'véhicules'],
  ['pedestrians', 'piétons'],
  ['gross estimated impressions', 'impressions brutes estimées'],
  ['degrees clockwise from north', 'degrés dans le sens horaire depuis le nord'],
  ['metres', 'mètres'],
  ['metres above ground', 'mètres au-dessus du sol'],
  ['metres from site coordinate', 'mètres depuis les coordonnées du site'],
  ['registered illumination configuration', 'configuration d’éclairage enregistrée'],
  ['score out of 100', 'score sur 100'],
  ['declared AADT vehicles/day', 'TMJA déclaré en véhicules/jour'],
  ['administrative containment', 'appartenance administrative'],
  ['mapped features within geodesic catchment', 'éléments cartographiés dans la zone géodésique'],
  ['modelled residents (people), not audience', 'résidents modélisés (personnes), pas audience'],
  [
    'observed interval counts; not daily traffic or exposure',
    'comptages sur un intervalle observé ; pas trafic journalier ni exposition',
  ],
  ['available', 'Disponible'],
  ['unavailable', 'Indisponible'],
  ['partial', 'Partiel'],
  ['unknown', 'Inconnu'],
  ['ready', 'Prêt'],
  ['unverified', 'Non vérifié'],
  ['partner_declared', 'Déclaré par le partenaire'],
  ['field_verified', 'Vérifié sur le terrain'],
  ['third_party', 'Vérifié par un tiers'],
  ['current', 'Actuel'],
  ['stale', 'Périmé'],
  ['future', 'Futur'],
  ['mapped', 'Cartographié'],
  ['modelled', 'Modélisé'],
  ['observed', 'Observé'],
  ['visibility', 'Visibilité'],
  ['traffic', 'Trafic'],
  ['structure', 'Structure'],
  ['population', 'Population'],
  ['demographics', 'Démographie'],
  ['lighting', 'Éclairage'],
  ['illumination', 'Éclairage'],
  ['poi', 'Points d’intérêt'],
  ['permit', 'Permis'],
  ['audience', 'Audience'],
  ['environment', 'Environnement'],
  ['budget', 'Budget'],
  ['currency', 'Devise'],
  ['flight dates', 'Dates de diffusion'],
  ['market or city', 'Marché ou ville'],
  ['loaded', 'Chargé'],
  ['read_budget_exhausted', 'Limite de lecture atteinte'],
  ['temporarily_unavailable', 'Temporairement indisponible'],
  ['complete', 'Complet'],
  ['outside', 'Hors couverture'],
  ['northbound', 'Vers le nord'],
  ['southbound', 'Vers le sud'],
  ['eastbound', 'Vers l’est'],
  ['westbound', 'Vers l’ouest'],
  ['Northbound', 'Vers le nord'],
  ['Southbound', 'Vers le sud'],
  ['Eastbound', 'Vers l’est'],
  ['Westbound', 'Vers l’ouest'],
  ['north', 'Nord'],
  ['south', 'Sud'],
  ['east', 'Est'],
  ['west', 'Ouest'],
  ['both', 'Les deux sens'],
  ['both_directions', 'Les deux sens'],
  ['car', 'Voiture'],
  ['cars', 'Voitures'],
  ['bus', 'Bus'],
  ['buses', 'Bus'],
  ['truck', 'Camion'],
  ['trucks', 'Camions'],
  ['motorcycle', 'Moto'],
  ['motorcycles', 'Motos'],
  ['bicycle', 'Vélo'],
  ['bicycles', 'Vélos'],
  ['light_vehicle', 'Véhicule léger'],
  ['heavy_vehicle', 'Véhicule lourd'],
]);
const englishEnumLabels = new Map<string, string>([
  ['partner_declared', 'Partner declared'],
  ['field_verified', 'Field verified'],
  ['third_party', 'Third-party'],
  ['read_budget_exhausted', 'Read limit reached'],
  ['temporarily_unavailable', 'Temporarily unavailable'],
  ['both_directions', 'Both directions'],
  ['light_vehicle', 'Light vehicle'],
  ['heavy_vehicle', 'Heavy vehicle'],
]);
const englishLabels = new Map<string, string>();
for (const [english, french] of frenchLabels) {
  if (!englishLabels.has(french)) englishLabels.set(french, english);
}

/** Controlled unit/enum labels only; never normalizes unknown provider values. */
export function agencyEvidenceUnit(value: string, locale: 'en' | 'fr'): string {
  return locale === 'fr'
    ? (frenchLabels.get(value) ?? value)
    : (englishEnumLabels.get(value) ?? englishLabels.get(value) ?? value);
}
