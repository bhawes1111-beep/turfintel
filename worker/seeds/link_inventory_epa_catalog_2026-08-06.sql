-- Link only inventory products whose EPA registration was verified against
-- the official PPLS record. Names with multiple possible registrations are
-- intentionally left unlinked for container-label review.

UPDATE inventory_items SET epa_number = '100-1364', product_catalog_id = 'pc-daconil-action-100-1364' WHERE name = 'DACONIL ACTION';
UPDATE inventory_items SET epa_number = '100-1642', product_catalog_id = 'pc-appear-ii-fungicide-100-1642' WHERE name = 'APPEAR II FUNGICIDE';
UPDATE inventory_items SET epa_number = '2217-1072', product_catalog_id = 'pc-arkon-2217-1072' WHERE name = 'ARKON';
UPDATE inventory_items SET epa_number = '100-1477', product_catalog_id = 'pc-ascernity-100-1477' WHERE name = 'ASCERNITY';
UPDATE inventory_items SET epa_number = '2217-696', product_catalog_id = 'pc-bensumec-4l-2217-696' WHERE name = 'BENSUMEC 4L';
UPDATE inventory_items SET epa_number = '53883-534', product_catalog_id = 'pc-contrado-sc-53883-534' WHERE name = 'CONTRADO SC';
UPDATE inventory_items SET epa_number = '101563-210', product_catalog_id = 'pc-densicor-101563-210' WHERE name = 'DENSICOR';
UPDATE inventory_items SET epa_number = '53883-500', product_catalog_id = 'pc-dithiopyr-2ew-53883-500' WHERE name = 'DITHIOPYR 2EW';
UPDATE inventory_items SET epa_number = '66222-161', product_catalog_id = 'pc-fosetyl-al-80-wdg-66222-161' WHERE name = 'FOSETYL-AL 80 WDG';
UPDATE inventory_items SET epa_number = '19713-526', product_catalog_id = 'pc-imitator-plus-19713-526' WHERE name = 'IMITATOR PLUS';
UPDATE inventory_items SET epa_number = '70506-103', product_catalog_id = 'pc-metricor-df-70506-103' WHERE name = 'METRICOR DF';
UPDATE inventory_items SET epa_number = '53883-307', product_catalog_id = 'pc-negate-37wg-53883-307' WHERE name = 'NEGATE 37WG';
UPDATE inventory_items SET epa_number = '53883-477', product_catalog_id = 'pc-pendant-sc-53883-477' WHERE name = 'PENDANT SC';
UPDATE inventory_items SET epa_number = '53883-363', product_catalog_id = 'pc-propiconazole-14-3-53883-363' WHERE name = 'PROPICONAZOLE 14.3';
UPDATE inventory_items SET epa_number = '101563-223', product_catalog_id = 'pc-resilia-101563-223' WHERE name = 'RESILIA';
UPDATE inventory_items SET epa_number = '101563-53', product_catalog_id = 'pc-revolver-101563-53' WHERE name = 'REVOLVER';
UPDATE inventory_items SET epa_number = '101563-207', product_catalog_id = 'pc-specticle-flo-101563-207' WHERE name = 'SPECTICLE FLO';
UPDATE inventory_items SET epa_number = '2217-835', product_catalog_id = 'pc-speed-zone-southern-2217-835' WHERE name = 'SPEED ZONE SOUTHERN';
UPDATE inventory_items SET epa_number = '93051-6', product_catalog_id = 'pc-sulfen-southern-93051-6' WHERE name = 'SULFEN SOUTHERN';
UPDATE inventory_items SET epa_number = '66222-117', product_catalog_id = 'pc-tebuconazole-3-6f-66222-117' WHERE name = 'TEBUCONAZOLE 3.6F';
UPDATE inventory_items SET epa_number = '80697-4', product_catalog_id = 'pc-tide-paclo-2sc-80697-4' WHERE name = 'TIDE PACLO 2SC';
UPDATE inventory_items SET epa_number = '100-1722', product_catalog_id = 'pc-trefinti-100-1722' WHERE name = 'TREFINTI';
UPDATE inventory_items SET epa_number = '101563-147', product_catalog_id = 'pc-tribute-total-101563-147' WHERE name = 'TRIBUTE TOTAL';
UPDATE inventory_items SET epa_number = '89442-7', product_catalog_id = 'pc-trin-pac-89442-7' WHERE name = 'TRIN-PAC';
UPDATE inventory_items SET epa_number = '84059-14', product_catalog_id = 'pc-zelto-84059-14' WHERE name = 'ZELTO';
UPDATE inventory_items SET manufacturer = 'Quali-Pro', epa_number = '53883-366', product_catalog_id = 'pc-bifenthrin-golf-nursery-7-9f-53883-366' WHERE name = 'BIFEN GOLF & NURSERY';
UPDATE inventory_items SET manufacturer = 'Quali-Pro', epa_number = '66222-184', product_catalog_id = 'pc-rimsulfuron-25-df-66222-184' WHERE name = 'RIMSULFURON';
UPDATE inventory_items SET epa_number = '53883-353', product_catalog_id = 'pc-t-nex-53883-353' WHERE name = 'T-NEX';
UPDATE inventory_items SET manufacturer = 'Quali-Pro', epa_number = '53883-483', product_catalog_id = 'pc-tm-4-5-flowable-53883-483' WHERE name = 'TM 4.5';

DELETE FROM product_catalog WHERE id = 'pc-daconil-action-100-1456';
DELETE FROM product_catalog WHERE id = 'pc-propiconazole-14-3-53883-174';
DELETE FROM product_catalog WHERE id = 'pc-tebuconazole-3-6f-66330-341';
DELETE FROM product_catalog WHERE id = 'pc-bifen-golf-nursery-53883-366';
DELETE FROM product_catalog WHERE id = 'pc-rimsulfuron-66222-184';
