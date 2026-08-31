<?php
/**
 * Plantilla de respaldo: páginas y entradas que se creen desde WordPress.
 * La portada la sirve front-page.php.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
get_header();
?>
<main class="wrap" style="padding:5rem 0; max-width:56rem;">
<?php
if ( have_posts() ) {
	while ( have_posts() ) {
		the_post();
		?>
	<article <?php post_class(); ?>>
		<h1 class="title" style="font-size:clamp(1.7rem,4vw,2.6rem);"><?php the_title(); ?></h1>
		<div class="lead"><?php the_content(); ?></div>
	</article>
		<?php
	}
	the_posts_pagination();
} else {
	echo '<p class="lead">' . esc_html__( 'No hay contenido todavía.', 'lgs-kids-landing' ) . '</p>';
}
?>
</main>
<?php get_footer(); ?>
