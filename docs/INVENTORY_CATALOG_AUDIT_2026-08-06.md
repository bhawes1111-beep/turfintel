# Inventory Catalog Audit - 2026-08-06

## Scope

The live inventory contains 115 records. This review separates agronomic
products from equipment parts and fuel. Pesticide registrations were checked
against the U.S. EPA Pesticide Product Label System (PPLS). Fertilizers,
wetting agents, pigments, and biostimulants are not EPA-registered pesticides;
their catalog records require a manufacturer label, guaranteed analysis, SDS,
or technical data sheet.

## EPA-verified and catalog-ready

The generated seed contains the official registration number, registrant,
formulation, active ingredients, registration status, signal word, restricted
use flag, target pests, registered sites, and latest EPA-accepted label PDF.

- DACONIL ACTION - 100-1364
- APPEAR II FUNGICIDE - 100-1642
- ARKON - 2217-1072
- ASCERNITY - 100-1477
- BENSUMEC 4L - 2217-696
- CONTRADO SC - 53883-534
- DENSICOR - 101563-210
- DITHIOPYR 2EW - 53883-500
- FOSETYL-AL 80 WDG - 66222-161
- IMITATOR PLUS - 19713-526
- METRICOR DF - 70506-103
- NEGATE 37WG - 53883-307
- PENDANT SC - 53883-477
- PROPICONAZOLE 14.3 - 53883-363 (Quali-Pro)
- RESILIA - 101563-223
- REVOLVER - 101563-53
- SPECTICLE FLO - 101563-207
- SPEED ZONE SOUTHERN - 2217-835
- SULFEN SOUTHERN - 93051-6
- TEBUCONAZOLE 3.6F - 66222-117 (Quali-Pro)
- TIDE PACLO 2SC - 80697-4
- TREFINTI - 100-1722
- TRIBUTE TOTAL - 101563-147
- TRIN-PAC - 89442-7
- ZELTO - 84059-14
- BIFEN GOLF & NURSERY - 53883-366 (Quali-Pro; restricted use)
- RIMSULFURON - 66222-184 (Quali-Pro Rimsulfuron 25 DF)
- T-NEX - 53883-353 (Quali-Pro)

## Container EPA number needed

These names return multiple registrations, distributor labels, legacy labels,
or no unique exact match. Record the EPA Reg. No. from the container before
linking them so the catalog cannot attach the wrong label.

- FAME C+
- FUSILADE 2
- HALO 75 WDG
- MANZATE T&O
- ME-TRY-BUZIN 75 DF
- MSMA PLUS
- NEMAMECTIN 0.7 SC
- PEDIGREE FUNGICIDE SC
- PROHEX 27.5
- SECURE ACTION FUNGICIDE
- SEGWAY
- SERATA
- SIMAZINE 4L
- STRICORE
- SULFEN 4SC
- TRIGON NEMATODE CONTROL

For each product, capture the product name exactly as printed, EPA Reg. No.,
manufacturer/distributor, and front/back label photos.

## Manufacturer document needed

These are fertilizers, nutrients, soil amendments, pigments, wetting agents,
or biostimulants. EPA pesticide labels do not apply. A complete catalog entry
needs the exact manufacturer, product label or technical sheet, guaranteed
analysis, formulation, density where applicable, labeled rates, package size,
and SDS URL.

- 13-0-46 POTASSIUM NITRATE
- 13-2-13 GREENS
- 13.5-0-46 GG FLOWABLE ULTRA-SOL
- 15.5-0-0 CALCIUM NITRATE
- 18-3-18 50 METHEX GREENS
- 20-6-13 PURSELL 60 DAY
- 21-0-21 STAMPEDE PURSELL
- 21-7-14
- 21-7-14 MINI
- 46-0-0 UREA
- 5-4-5 GREENSGRADE
- AMPLIPHY
- BIORYTHEM
- CALCIUM NITRATE 15.5-0-0 GREENHOUSE
- CALCIUM NITRATE 15.5-0-0 TROPICOTE
- DOUBLE BASS
- ECOLITE SOIL AMENDMENT
- EPSOM SALT (MAGNESIUM SULFATE) SPRAY GRADE 44PP
- HARMONY
- HIGHNOTE 32-0-0
- K+ MICRO CRYSTAL
- KICK DRUM
- LOW END
- MICROTONE MANGANESE COMBO 1% MG
- MYCO REPLENISH 3-3-3 GREENS
- PRIZE PHITER 2-40-16
- REDOX K+
- ROOT HARMONY SEA POWER
- ROOTNOTE 3-18-18
- SWEET HEAT (two inventory records)
- THE SEA SUGAR
- VERDE-CAL G GREENS
- VERDE-CAL GREENS

## Data-quality notes

- The old DACONIL ACTION catalog entry used EPA 100-1456, which belongs to a
  prodiamine herbicide. It was corrected to EPA 100-1364.
- `PROPICONAZOLE 14.3` and `TEBUCONAZOLE 3.6F` now use Quali-Pro's active
  registrations instead of the older inactive registrations initially found.
- `ZELTO` and `TREFINTI` are stored under the catalog's insecticide class based
  on EPA pesticide type; their inventory use can still remain nematicide.
- Equipment parts and fuel remain inventory-only records and are not pesticide
  catalog candidates.
